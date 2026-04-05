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
// idle      → song ziehen
// guessing  → Slot auswählen + Suche + 29s-Timer
// flipping  → Karte dreht sich (700ms)
// result    → Ergebnis-Box sichtbar (auto 2s → animating)
// animating → Karte fliegt weg (700ms) → done
// done      → „Nächster Spieler"-Button sichtbar
// switching → Vollbild-Overlay (2s auto → idle)
type Phase = "idle" | "guessing" | "flipping" | "result" | "animating" | "done" | "switching";

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Position richtig           → +1 Basispunkt
// + Titel richtig eingegeben → +1 Bonuspunkt
// + Interpret richtig        → +1 Bonuspunkt
// Position falsch            → 0 Punkte (auch wenn Titel/Interpret korrekt)

const GUESS_SECONDS = 29;

interface ScoreBreakdown {
  positionCorrect: boolean;
  titleCorrect: boolean;
  artistCorrect: boolean;
  total: number; // 0–3
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
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [animClass, setAnimClass] = useState<"" | "anim-correct" | "anim-wrong">("");

  // 29s countdown
  const [countdown, setCountdown] = useState(GUESS_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; };
  const clearSwitchTimer = () => { if (switchTimerRef.current) clearTimeout(switchTimerRef.current); switchTimerRef.current = null; };

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
    setGuessResult(null);
    setPhase("guessing");
    startCountdown();
  };

  // ── Place card (called after search OR direct timeline click) ─────────────
  // guess is optional — if not passed, only position is scored
  const placeCard = useCallback((
    index: number,
    guess?: GuessResult
  ) => {
    if (!activeCard) return;
    stopCountdown();

    const currentTimeline = playerTimelines[currentPlayerIdx];
    const prevYear = index > 0 ? currentTimeline[index - 1].song.release_year : -Infinity;
    const nextYear = index < currentTimeline.length ? currentTimeline[index].song.release_year : Infinity;
    const cardYear = activeCard.song.release_year;
    const positionCorrect = cardYear >= prevYear && cardYear <= nextYear;

    const titleCorrect = positionCorrect && !!guess?.titleCorrect;
    const artistCorrect = positionCorrect && !!guess?.artistCorrect;
    const total = positionCorrect ? 1 + (titleCorrect ? 1 : 0) + (artistCorrect ? 1 : 0) : 0;

    log(`📍 idx=${index} year=${cardYear} → pos:${positionCorrect} title:${titleCorrect} artist:${artistCorrect} total:${total}`);

    const breakdown: ScoreBreakdown = { positionCorrect, titleCorrect, artistCorrect, total };
    setScoreBreakdown(breakdown);
    setPendingIndex(positionCorrect ? index : null);
    setGuessResult(guess ?? null);
    audioRef.current?.pause();

    setIsCardFlipped(true);
    setPhase("flipping");
    clearTimer();
    timerRef.current = setTimeout(() => setPhase("result"), 700);
  }, [activeCard, playerTimelines, currentPlayerIdx, stopCountdown]);

  // ── Timeline click (no text guess) ───────────────────────────────────────
  const handlePlaceCard = useCallback((index: number) => {
    if (phase !== "guessing") return;
    placeCard(index);
  }, [phase, placeCard]);

  // ── Search submit ─────────────────────────────────────────────────────────
  const handleSearchSubmit = useCallback((guess: GuessResult) => {
    if (!activeCard || phase !== "guessing") return;
    // Find best chronological slot
    const timeline = playerTimelines[currentPlayerIdx];
    let bestIndex = timeline.length;
    for (let i = 0; i < timeline.length; i++) {
      if (activeCard.song.release_year <= timeline[i].song.release_year) {
        bestIndex = i;
        break;
      }
    }
    placeCard(bestIndex, guess);
  }, [activeCard, phase, playerTimelines, currentPlayerIdx, placeCard]);

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
  const handleNextPlayer = () => {
    setPhase(players.length > 1 ? "switching" : "idle");
  };

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
  const timerProgress = countdown / GUESS_SECONDS;
  const timerDanger = countdown <= 10;
  const prevPlayerScore = playerScores[(currentPlayerIdx + players.length - 1) % players.length];
  const totalPointsThisTurn = scoreBreakdown?.total ?? 0;

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
            {/* Countdown ring */}
            {phase === "guessing" && (
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
                    <span>Position{scoreBreakdown.positionCorrect ? ` (${activeCard.song.release_year})` : ` — war ${activeCard.song.release_year}`}</span>
                    <span className="result-pts">{scoreBreakdown.positionCorrect ? "+1" : "0"}</span>
                  </div>
                  {guessResult && (
                    <>
                      <div className="result-row bonus">
                        <span>{scoreBreakdown.titleCorrect ? "🎵" : "—"}</span>
                        <span>Titel{scoreBreakdown.titleCorrect ? " korrekt" : guessResult.titleInput ? ` (war: ${activeCard.song.track_name})` : " nicht eingegeben"}</span>
                        <span className="result-pts">{scoreBreakdown.titleCorrect ? "+1" : "0"}</span>
                      </div>
                      <div className="result-row bonus">
                        <span>{scoreBreakdown.artistCorrect ? "🎤" : "—"}</span>
                        <span>Interpret{scoreBreakdown.artistCorrect ? " korrekt" : guessResult.artistInput ? ` (war: ${activeCard.song.artist})` : " nicht eingegeben"}</span>
                        <span className="result-pts">{scoreBreakdown.artistCorrect ? "+1" : "0"}</span>
                      </div>
                    </>
                  )}
                  <div className="result-total">
                    Gesamt: <strong>{scoreBreakdown.total} Punkt{scoreBreakdown.total !== 1 ? "e" : ""}</strong>
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
                  onError={(e) => log(`❌ Audio error:`, (e.target as HTMLAudioElement).error?.message)}
                />
              ) : (
                <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Kein Audio-Preview
                </span>
              )}
            </div>

            {/* Song search */}
            {phase === "guessing" && (
              <div className="guessing-zone">
                <SongSearch
                  activeSong={{ id: activeCard.song.id, track_name: activeCard.song.track_name, artist: activeCard.song.artist }}
                  allSongs={allSongs}
                  onSubmit={handleSearchSubmit}
                />
                <p className="hint-text">
                  Titel &amp; Interpret eingeben — oder direkt Position in der Zeitleiste wählen.
                </p>
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
                <button className="btn" onClick={handleDrawCard}>Song ziehen</button>
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
          isPlacing={phase === "guessing"}
          onPlaceCard={handlePlaceCard}
        />
      </div>
    </div>
  );
};
