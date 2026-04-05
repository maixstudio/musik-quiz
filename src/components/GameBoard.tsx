"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Timeline } from "./Timeline";
import { GameCard } from "./GameCard";
import { SongSearch } from "./SongSearch";
import type { GuessResult } from "./SongSearch";
import type { Song as SearchSong } from "./SongSearch";
import type { TimelineCard, Player } from "@/core/domain/models";
import { supabase } from "@/infrastructure/supabase/supabaseClient";
import { getFreshPreviewUrl } from "@/app/actions/getDeezerPreview";
import "./GameBoard.css";

// ─── Phase machine ────────────────────────────────────────────────────────────
// idle      → Song ziehen
// entering  → Song spielt, Timer läuft, Textfelder aktiv
//              → "Weiter →"  →  placing
//              → "Überspringen" →  placing (ohne Texteingabe)
// placing   → Textguess gesperrt, Karte muss in Zeitstrahl eingeordnet werden
// flipping  → Karte dreht sich (700ms)
// result    → Ergebnis-Box sichtbar (2s auto → animating)
// animating → Karte fliegt weg (700ms) → done
// done      → „Nächster Spieler"-Button sichtbar
// switching → Vollbild-Overlay (2s auto → idle)
type Phase =
  | "idle"
  | "entering"
  | "placing"
  | "flipping"
  | "result"
  | "animating"
  | "done"
  | "switching";

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Position richtig           → +1 Basispunkt
// + Titel richtig eingegeben → +1 Bonuspunkt
// + Interpret richtig        → +1 Bonuspunkt
// Position falsch            → 0 Punkte  (auch wenn Titel/Interpret korrekt)
const GUESS_SECONDS = 29;

interface ScoreBreakdown {
  positionCorrect: boolean;
  titleCorrect: boolean;
  artistCorrect: boolean;
  total: number;
}

interface GameBoardProps {
  playlistId: string;
  players: Player[];
  onEndGame: () => void;
}

const log = (...args: unknown[]) =>
  console.log(`%c[GameBoard]`, "color:#cc97ff;font-weight:bold", ...args);

export const GameBoard: React.FC<GameBoardProps> = ({ playlistId, players, onEndGame }) => {
  const [playerTimelines, setPlayerTimelines] = useState<TimelineCard[][]>(() =>
    players.map(() => [])
  );
  const [playerScores, setPlayerScores] = useState<number[]>(() => players.map(() => 0));
  const [allSongs, setAllSongs] = useState<SearchSong[]>([]);
  const [deck, setDeck] = useState<TimelineCard[]>([]);
  const [activeCard, setActiveCard] = useState<TimelineCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [lockedGuess, setLockedGuess] = useState<GuessResult | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [animClass, setAnimClass] = useState<"" | "anim-correct" | "anim-wrong">("");

  // 29s countdown (only during "entering" phase)
  const [countdown, setCountdown] = useState(GUESS_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const clearSwitchTimer = () => {
    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    switchTimerRef.current = null;
  };
  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);
  const startCountdown = useCallback(() => {
    stopCountdown();
    setCountdown(GUESS_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { stopCountdown(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  useEffect(() => {
    initGame();
    return () => { clearTimer(); clearSwitchTimer(); stopCountdown(); };
  }, [playlistId]);

  const initGame = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("songs").select("*").eq("playlist_id", playlistId);
    if (error) log("❌ Supabase error:", error.message);
    if (data && data.length > 0) {
      log(`✅ Loaded ${data.length} songs.`);
      setAllSongs(data.map((s) => ({ id: s.id, track_name: s.track_name, artist: s.artist })));
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      const starterCount = Math.min(players.length, shuffled.length);
      setPlayerTimelines(players.map((_, i) =>
        i < starterCount ? [{ song: shuffled[i], status: "revealed" as const }] : []
      ));
      setPlayerScores(players.map(() => 0));
      setDeck(shuffled.slice(starterCount).map((s) => ({ song: s, status: "hidden" as const })));
    }
    setLoading(false);
  };

  // ── Draw ──────────────────────────────────────────────────────────────────
  const handleDrawCard = async () => {
    if (deck.length === 0) return;
    const nextCard = deck[0];
    setDeck((d) => d.slice(1));
    let freshCard = { ...nextCard };
    if (nextCard.song.deezer_id) {
      const freshUrl = await getFreshPreviewUrl(nextCard.song.deezer_id);
      if (freshUrl) freshCard = { ...nextCard, song: { ...nextCard.song, preview_url: freshUrl } };
    }
    log(`🃏 Drawing: "${freshCard.song.track_name}"`);
    setActiveCard(freshCard);
    setIsCardFlipped(false);
    setAnimClass("");
    setScoreBreakdown(null);
    setLockedGuess(null);
    setPhase("entering");
    startCountdown();
  };

  // ── Confirm text guess → move to placing ─────────────────────────────────
  const handleConfirmGuess = useCallback((guess: GuessResult) => {
    stopCountdown();
    setLockedGuess(guess);
    setPhase("placing");
    log(`🔒 Guess locked — title:${guess.titleInput || "—"} artist:${guess.artistInput || "—"}`);
  }, [stopCountdown]);

  // ── Skip text entry, go straight to placing ───────────────────────────────
  const handleSkipToPlacing = useCallback(() => {
    stopCountdown();
    setLockedGuess(null);
    setPhase("placing");
    log("⏭ Skipped text entry");
  }, [stopCountdown]);

  // ── Timeline click (placing phase only) ──────────────────────────────────
  const handlePlaceCard = useCallback((index: number) => {
    if (!activeCard || phase !== "placing") return;

    const currentTimeline = playerTimelines[currentPlayerIdx];
    const prevYear = index > 0 ? currentTimeline[index - 1].song.release_year : -Infinity;
    const nextYear = index < currentTimeline.length ? currentTimeline[index].song.release_year : Infinity;
    const cardYear = activeCard.song.release_year;
    const positionCorrect = cardYear >= prevYear && cardYear <= nextYear;

    const titleCorrect = positionCorrect && (lockedGuess?.titleCorrect ?? false);
    const artistCorrect = positionCorrect && (lockedGuess?.artistCorrect ?? false);
    const total = positionCorrect
      ? 1 + (titleCorrect ? 1 : 0) + (artistCorrect ? 1 : 0)
      : 0;

    log(`📍 idx=${index} year=${cardYear} → pos:${positionCorrect} title:${titleCorrect} artist:${artistCorrect} pts:${total}`);

    const breakdown: ScoreBreakdown = { positionCorrect, titleCorrect, artistCorrect, total };
    setScoreBreakdown(breakdown);
    setPendingIndex(positionCorrect ? index : null);
    audioRef.current?.pause();

    setIsCardFlipped(true);
    setPhase("flipping");
    clearTimer();
    timerRef.current = setTimeout(() => setPhase("result"), 700);
  }, [activeCard, phase, playerTimelines, currentPlayerIdx, lockedGuess]);

  // ── Dismiss result → start animation ─────────────────────────────────────
  const handleDismissResult = useCallback(() => {
    if (phase !== "result") return;
    clearTimer();

    const isCorrect = scoreBreakdown?.positionCorrect ?? false;
    const points = scoreBreakdown?.total ?? 0;

    if (isCorrect && pendingIndex !== null) {
      setPlayerTimelines((prev) => {
        const updated = prev.map((tl) => [...tl]);
        updated[currentPlayerIdx].splice(pendingIndex, 0, { ...activeCard!, status: "revealed" });
        return updated;
      });
      setPlayerScores((prev) => {
        const u = [...prev];
        u[currentPlayerIdx] += points;
        return u;
      });
      log(`📥 +${points} pts for ${players[currentPlayerIdx].name}`);
    }

    setPhase("animating");
    setAnimClass(isCorrect ? "anim-correct" : "anim-wrong");
    timerRef.current = setTimeout(() => {
      setActiveCard(null);
      setAnimClass("");
      setPendingIndex(null);
      setIsCardFlipped(false);
      setPhase("done");
    }, 700);
  }, [phase, scoreBreakdown, pendingIndex, activeCard, currentPlayerIdx, players]);

  // Auto-dismiss result after 2 s
  useEffect(() => {
    if (phase === "result") {
      const t = setTimeout(() => handleDismissResult(), 2000);
      return () => clearTimeout(t);
    }
  }, [phase, handleDismissResult]);

  // ── Next player ───────────────────────────────────────────────────────────
  const handleNextPlayer = () => setPhase(players.length > 1 ? "switching" : "idle");

  // ── Switch player ─────────────────────────────────────────────────────────
  const handleSwitchPlayer = useCallback(() => {
    clearSwitchTimer();
    const nextIdx = (currentPlayerIdx + 1) % players.length;
    log(`🔄 → ${players[nextIdx].name}`);
    setCurrentPlayerIdx(nextIdx);
    setPhase("idle");
  }, [currentPlayerIdx, players]);

  useEffect(() => {
    if (phase === "switching") {
      clearSwitchTimer();
      switchTimerRef.current = setTimeout(handleSwitchPlayer, 2000);
    }
    return () => clearSwitchTimer();
  }, [phase, handleSwitchPlayer]);

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading Game...</div>;

  const currentTimeline = playerTimelines[currentPlayerIdx] ?? [];
  const currentPlayer = players[currentPlayerIdx];
  const prevPlayer = players[(currentPlayerIdx + players.length - 1) % players.length];
  const nextPlayer = players[(currentPlayerIdx + 1) % players.length];
  const prevPlayerScore = playerScores[(currentPlayerIdx + players.length - 1) % players.length];
  const totalPointsThisTurn = scoreBreakdown?.total ?? 0;

  const timerProgress = countdown / GUESS_SECONDS;
  const timerDanger = countdown <= 10;

  // Timeline is "active" (drop zones visible) only in placing phase
  const isPlacing = phase === "placing";

  return (
    <div className="game-board">
      {/* ── Header ── */}
      <header className="game-header">
        <h1 className="neon-text title">The Neon Archivist</h1>
        <div className="scoreboard">
          {players.map((p, i) => (
            <div key={p.id} className={`score-chip ${i === currentPlayerIdx ? "active" : ""}`}>
              <span className="score-name">{p.name}</span>
              <span className="score-points">{playerScores[i]}</span>
            </div>
          ))}
        </div>
        <button onClick={onEndGame} className="btn btn-secondary">Quit</button>
      </header>

      {/* ── Switching overlay ── */}
      {phase === "switching" && (
        <div className="switching-overlay" onClick={handleSwitchPlayer}>
          <div className="switching-content">
            <div className="switching-done">
              <span className="switching-emoji">{totalPointsThisTurn > 0 ? "🎉" : "😬"}</span>
              <p className="switching-prev-name">{prevPlayer.name}</p>
              <p className="switching-result-text">
                {totalPointsThisTurn > 0
                  ? `+${totalPointsThisTurn} Punkt${totalPointsThisTurn > 1 ? "e" : ""}! Gesamt: ${prevPlayerScore}`
                  : "Kein Punkt diese Runde"}
              </p>
            </div>
            <div className="switching-divider" />
            <div className="switching-next">
              <p className="switching-label">Jetzt dran:</p>
              <p className="switching-next-name neon-text">{nextPlayer.name}</p>
            </div>
            <p className="switching-hint">Tippen zum Überspringen</p>
          </div>
        </div>
      )}

      {/* ── Play area ── */}
      <div className="play-area">
        {activeCard ? (
          <div className="active-card-container">
            {/* Countdown ring — only during text entry */}
            {phase === "entering" && (
              <div className={`countdown-ring ${timerDanger ? "danger" : ""}`}>
                <svg viewBox="0 0 44 44" className="countdown-svg">
                  <circle className="countdown-bg" cx="22" cy="22" r="18" />
                  <circle
                    className="countdown-progress"
                    cx="22" cy="22" r="18"
                    strokeDasharray={`${timerProgress * 113.1} 113.1`}
                  />
                </svg>
                <span className="countdown-number">{countdown}</span>
              </div>
            )}

            <div className={`flying-card-wrap ${animClass}`}>
              <GameCard card={activeCard} isMiniature={false} isFlipped={isCardFlipped} />
            </div>

            {/* Result box */}
            {phase === "result" && scoreBreakdown && (
              <div
                className={`result-box ${scoreBreakdown.positionCorrect ? "correct" : "wrong"}`}
                onClick={handleDismissResult}
              >
                <div className="result-breakdown">
                  <div className="result-row">
                    <span>{scoreBreakdown.positionCorrect ? "✅" : "❌"}</span>
                    <span>
                      Position
                      {scoreBreakdown.positionCorrect
                        ? ` (${activeCard.song.release_year})`
                        : ` — war ${activeCard.song.release_year}`}
                    </span>
                    <span className="result-pts">{scoreBreakdown.positionCorrect ? "+1" : "0"}</span>
                  </div>
                  {lockedGuess && (
                    <>
                      <div className="result-row bonus">
                        <span>{scoreBreakdown.titleCorrect ? "🎵" : "—"}</span>
                        <span>
                          Titel
                          {scoreBreakdown.titleCorrect
                            ? " korrekt"
                            : lockedGuess.titleInput
                            ? ` (war: ${activeCard.song.track_name})`
                            : " nicht eingegeben"}
                        </span>
                        <span className="result-pts">{scoreBreakdown.titleCorrect ? "+1" : "0"}</span>
                      </div>
                      <div className="result-row bonus">
                        <span>{scoreBreakdown.artistCorrect ? "🎤" : "—"}</span>
                        <span>
                          Interpret
                          {scoreBreakdown.artistCorrect
                            ? " korrekt"
                            : lockedGuess.artistInput
                            ? ` (war: ${activeCard.song.artist})`
                            : " nicht eingegeben"}
                        </span>
                        <span className="result-pts">{scoreBreakdown.artistCorrect ? "+1" : "0"}</span>
                      </div>
                    </>
                  )}
                  <div className="result-total">
                    Gesamt:{" "}
                    <strong>
                      {scoreBreakdown.total} Punkt{scoreBreakdown.total !== 1 ? "e" : ""}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="audio-controls">
              {activeCard.song.preview_url ? (
                <audio
                  key={activeCard.song.id}
                  ref={audioRef}
                  controls
                  src={activeCard.song.preview_url}
                  autoPlay
                  onPlay={() => log(`▶ ${activeCard.song.track_name}`)}
                  onError={(e) =>
                    log(`❌ Audio error:`, (e.target as HTMLAudioElement).error?.message)
                  }
                />
              ) : (
                <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Kein Audio-Preview
                </span>
              )}
            </div>

            {/* ── Step 1: Text entry ── */}
            {phase === "entering" && (
              <div className="guessing-zone">
                <div className="step-label">Schritt 1 von 2 — Titel &amp; Interpret raten</div>
                <SongSearch
                  activeSong={{
                    id: activeCard.song.id,
                    track_name: activeCard.song.track_name,
                    artist: activeCard.song.artist,
                  }}
                  allSongs={allSongs}
                  onConfirm={handleConfirmGuess}
                />
                <button className="btn-skip-text" onClick={handleSkipToPlacing}>
                  Überspringen → nur Position raten
                </button>
              </div>
            )}

            {/* ── Step 2: Placement indicator ── */}
            {phase === "placing" && (
              <div className="placing-hint">
                <span className="step-label">Schritt 2 von 2</span>
                {lockedGuess && (lockedGuess.titleInput || lockedGuess.artistInput) ? (
                  <p>
                    Eingabe gesperrt:{" "}
                    {lockedGuess.titleInput && <strong>„{lockedGuess.titleInput}"</strong>}
                    {lockedGuess.titleInput && lockedGuess.artistInput && " – "}
                    {lockedGuess.artistInput && <em>{lockedGuess.artistInput}</em>}
                  </p>
                ) : (
                  <p>Keine Texteingabe — nur Position wird gewertet.</p>
                )}
                <p className="hint-text">Wähle jetzt die richtige Position in der Zeitleiste ↓</p>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-play-area glass-panel">
            {phase === "done" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                <p className="turn-result-summary">
                  {totalPointsThisTurn > 0
                    ? `🎉 +${totalPointsThisTurn} Punkt${totalPointsThisTurn > 1 ? "e" : ""} für ${currentPlayer.name}!`
                    : `😬 Kein Punkt für ${currentPlayer.name}.`}
                </p>
                {players.length > 1 ? (
                  <button className="btn btn-next-player" onClick={handleNextPlayer}>
                    ⏭ Nächster Spieler: {nextPlayer.name}
                  </button>
                ) : (
                  <button className="btn" onClick={() => setPhase("idle")}>
                    Nächste Runde
                  </button>
                )}
                <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                  {deck.length} Songs verbleibend
                </p>
              </div>
            ) : deck.length > 0 ? (
              <>
                <p className="player-prompt">
                  🎯 <strong>{currentPlayer.name}</strong>, zieh deinen Song!
                </p>
                <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.85rem" }}>
                  {deck.length} Songs verbleibend
                </p>
                <button className="btn" onClick={handleDrawCard}>
                  Song ziehen
                </button>
              </>
            ) : (
              <h2>Keine Songs mehr! 🎉</h2>
            )}
          </div>
        )}
      </div>

      {/* ── Timeline ── */}
      <div className="timeline-area">
        <Timeline
          cards={currentTimeline}
          isPlacing={isPlacing}
          onPlaceCard={handlePlaceCard}
        />
      </div>
    </div>
  );
};
