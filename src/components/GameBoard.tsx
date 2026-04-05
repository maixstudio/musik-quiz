"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Timeline } from "./Timeline";
import { GameCard } from "./GameCard";
import { SongSearch } from "./SongSearch";
import type { Song as SearchSong } from "./SongSearch";
import type { TimelineCard, Player } from "@/core/domain/models";
import { supabase } from "@/infrastructure/supabase/supabaseClient";
import { getFreshPreviewUrl } from "@/app/actions/getDeezerPreview";
import "./GameBoard.css";

// Phase machine:
// idle      → song ziehen
// guessing  → Slot auswählen + Suche + 29s-Timer
// flipping  → Karte dreht sich (700ms)
// result    → Ergebnis-Box sichtbar (1s auto → animating)
// animating → Karte fliegt weg (700ms) → done
// done      → „Nächster Spieler"-Button sichtbar, Deck/Timeline sichtbar
// switching → Vollbild-Overlay (2s auto → idle)
type Phase = "idle" | "guessing" | "flipping" | "result" | "animating" | "done" | "switching";

const GUESS_SECONDS = 29;

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
  const [placementResult, setPlacementResult] = useState<"correct" | "wrong" | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [animClass, setAnimClass] = useState<"" | "anim-correct" | "anim-wrong">("");
  const [turnScoreDelta, setTurnScoreDelta] = useState(0);

  // 29s countdown
  const [countdown, setCountdown] = useState<number>(GUESS_SECONDS);
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
        if (prev <= 1) {
          stopCountdown();
          return 0;
        }
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
    setPhase("guessing");
    startCountdown();
  };

  // ── Place ─────────────────────────────────────────────────────────────────
  const handlePlaceCard = useCallback((index: number, forceResult?: "correct" | "wrong") => {
    if (!activeCard) return;
    stopCountdown();
    const currentTimeline = playerTimelines[currentPlayerIdx];

    let isCorrect: boolean;
    if (forceResult !== undefined) {
      isCorrect = forceResult === "correct";
    } else {
      const prevYear = index > 0 ? currentTimeline[index - 1].song.release_year : -Infinity;
      const nextYear = index < currentTimeline.length ? currentTimeline[index].song.release_year : Infinity;
      const cardYear = activeCard.song.release_year;
      isCorrect = cardYear >= prevYear && cardYear <= nextYear;
    }

    log(`📍 idx=${index} → ${isCorrect ? "✅" : "❌"}`);
    setPendingIndex(isCorrect ? index : null);
    setPlacementResult(isCorrect ? "correct" : "wrong");
    setTurnScoreDelta(isCorrect ? 1 : 0);
    audioRef.current?.pause();

    setIsCardFlipped(true);
    setPhase("flipping");
    clearTimer();
    timerRef.current = setTimeout(() => setPhase("result"), 700);
  }, [activeCard, phase, playerTimelines, currentPlayerIdx, stopCountdown]);

  // ── Song guessed correctly via search ────────────────────────────────────
  const handleSongGuessed = useCallback((song: SearchSong) => {
    if (!activeCard || phase !== "guessing") return;
    const isActiveCard =
      song.track_name.toLowerCase() === activeCard.song.track_name.toLowerCase() &&
      song.artist.toLowerCase() === activeCard.song.artist.toLowerCase();

    if (!isActiveCard) {
      log("❌ Search match doesn't match active card — wrong guess");
      // Treat as wrong: place at index 0 with wrong result
      handlePlaceCard(0, "wrong");
      return;
    }
    log("🎯 Correct song guessed via search!");
    // Find best slot automatically (insert at correct chronological position)
    const timeline = playerTimelines[currentPlayerIdx];
    let bestIndex = timeline.length;
    for (let i = 0; i < timeline.length; i++) {
      if (activeCard.song.release_year <= timeline[i].song.release_year) {
        bestIndex = i;
        break;
      }
    }
    handlePlaceCard(bestIndex, "correct");
  }, [activeCard, phase, playerTimelines, currentPlayerIdx, handlePlaceCard]);

  // ── Dismiss result → start animation ─────────────────────────────────────
  const handleDismissResult = useCallback(() => {
    if (phase !== "result") return;
    clearTimer();

    if (placementResult === "correct" && pendingIndex !== null) {
      setPlayerTimelines((prev) => {
        const updated = prev.map((tl) => [...tl]);
        updated[currentPlayerIdx].splice(pendingIndex, 0, { ...activeCard!, status: "revealed" });
        return updated;
      });
      setPlayerScores((prev) => { const u = [...prev]; u[currentPlayerIdx] += 1; return u; });
      log(`📥 +1 point for ${players[currentPlayerIdx].name}`);
    }

    setPhase("animating");
    setAnimClass(placementResult === "correct" ? "anim-correct" : "anim-wrong");

    timerRef.current = setTimeout(() => {
      setActiveCard(null);
      setAnimClass("");
      setPendingIndex(null);
      setPlacementResult(null);
      setIsCardFlipped(false);
      setPhase("done");
    }, 700);
  }, [phase, placementResult, pendingIndex, activeCard, currentPlayerIdx, players]);

  // Auto-dismiss result after 1 s
  useEffect(() => {
    if (phase === "result") {
      const t = setTimeout(() => handleDismissResult(), 1000);
      return () => clearTimeout(t);
    }
  }, [phase, handleDismissResult]);

  // ── Next player ───────────────────────────────────────────────────────────
  const handleNextPlayer = () => {
    if (players.length > 1) {
      setPhase("switching");
    } else {
      setPhase("idle");
    }
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

  // Timer ring progress (0–1)
  const timerProgress = countdown / GUESS_SECONDS;
  const timerDanger = countdown <= 10;

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
              <span className="switching-emoji">{turnScoreDelta > 0 ? "🎉" : "😬"}</span>
              <p className="switching-prev-name">{prevPlayer.name}</p>
              <p className="switching-result-text">
                {turnScoreDelta > 0
                  ? `+1 Punkt! Gesamt: ${playerScores[(currentPlayerIdx + players.length - 1) % players.length]}`
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
            {phase === "result" && (
              <div
                className={`result-box ${placementResult}`}
                onClick={handleDismissResult}
              >
                <span className="result-icon">
                  {placementResult === "correct" ? "✅" : "❌"}
                </span>
                <span className="result-message">
                  {placementResult === "correct"
                    ? `Richtig! Erschienen ${activeCard.song.release_year}.`
                    : `Falsch! Der Song ist von ${activeCard.song.release_year}.`}
                </span>
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

            {/* Song search + placement hint */}
            {phase === "guessing" && (
              <div className="guessing-zone">
                <SongSearch
                  allSongs={allSongs}
                  onMatch={handleSongGuessed}
                />
                <p className="hint-text">
                  Kennst du den Song? Gib Titel &amp; Interpret ein — oder wähle direkt einen Platz in der Zeitleiste.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-play-area glass-panel">
            {phase === "done" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                <p className="turn-result-summary">
                  {turnScoreDelta > 0
                    ? `🎉 +1 Punkt für ${currentPlayer.name}!`
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
