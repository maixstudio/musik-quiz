"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Timeline } from "./Timeline";
import { GameCard } from "./GameCard";
import { SongVerifier } from "./SongVerifier";
import type { TimelineCard, Player } from "@/core/domain/models";
import { supabase } from "@/infrastructure/supabase/supabaseClient";
import { getFreshPreviewUrl } from "@/app/actions/getDeezerPreview";
import "./GameBoard.css";

// idle      → song ziehen
// naming    → Titel + Interpret eingeben (KI prüft)
// guessing  → Slot auswählen
// flipping  → Karte dreht sich (700ms)
// result    → Ergebnis-Box sichtbar (1s auto → animating)
// animating → Karte fliegt weg (700ms) → done
// done      → "Nächster Spieler"-Button sichtbar, Deck/Timeline sichtbar
// switching → Vollbild-Overlay (2s auto → idle)
type Phase = "idle" | "naming" | "guessing" | "flipping" | "result" | "animating" | "done" | "switching";

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
  const [nameCorrect, setNameCorrect] = useState<boolean | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; };
  const clearSwitchTimer = () => { if (switchTimerRef.current) clearTimeout(switchTimerRef.current); switchTimerRef.current = null; };

  useEffect(() => {
    initGame();
    return () => { clearTimer(); clearSwitchTimer(); };
  }, [playlistId]);

  const initGame = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("songs").select("*").eq("playlist_id", playlistId);
    if (error) log("❌ Supabase error:", error.message);
    if (data && data.length > 0) {
      log(`✅ Loaded ${data.length} songs.`);
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
    setNameCorrect(null);
    setPhase("naming");
  };

  // ── Naming result ─────────────────────────────────────────────────────────
  const handleNamingResult = (isValid: boolean) => {
    log(`🤖 Naming result: ${isValid ? "✅ correct" : "❌ wrong"}`);
    setNameCorrect(isValid);
    setPhase("guessing");
  };

  // ── Place ─────────────────────────────────────────────────────────────────
  const handlePlaceCard = (index: number) => {
    if (!activeCard || phase !== "guessing") return;
    const currentTimeline = playerTimelines[currentPlayerIdx];
    const prevYear = index > 0 ? currentTimeline[index - 1].song.release_year : -Infinity;
    const nextYear = index < currentTimeline.length ? currentTimeline[index].song.release_year : Infinity;
    const cardYear = activeCard.song.release_year;
    const isCorrect = cardYear >= prevYear && cardYear <= nextYear;
    const namingPoint = nameCorrect ? 1 : 0;
    const placementPoint = isCorrect ? 1 : 0;

    log(`📍 idx=${index} year=${cardYear} → ${isCorrect ? "✅" : "❌"} | naming: ${nameCorrect ? "✅" : "❌"}`);
    setPendingIndex(isCorrect ? index : null);
    setPlacementResult(isCorrect ? "correct" : "wrong");
    setTurnScoreDelta(namingPoint + placementPoint);
    audioRef.current?.pause();

    // 1. Flip card
    setIsCardFlipped(true);
    setPhase("flipping");
    clearTimer();
    timerRef.current = setTimeout(() => setPhase("result"), 700);
  };

  // ── Dismiss result → start animation ─────────────────────────────────────
  const handleDismissResult = useCallback(() => {
    if (phase !== "result") return;
    clearTimer();

    // Commit score & timeline
    if (placementResult === "correct" && pendingIndex !== null) {
      setPlayerTimelines((prev) => {
        const updated = prev.map((tl) => [...tl]);
        updated[currentPlayerIdx].splice(pendingIndex, 0, { ...activeCard!, status: "revealed" });
        return updated;
      });
    }
    if (turnScoreDelta > 0) {
      setPlayerScores((prev) => { const u = [...prev]; u[currentPlayerIdx] += turnScoreDelta; return u; });
      log(`📥 +${turnScoreDelta} point(s) for ${players[currentPlayerIdx].name}`);
    }

    // Start fly animation
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

  // Auto-advance switching overlay after 2 s
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
            <div className={`flying-card-wrap ${animClass}`}>
              <GameCard card={activeCard} isMiniature={false} isFlipped={isCardFlipped} />
            </div>

            {/* Result box — sits BELOW the card, not over it */}
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
                    ? `Jahr richtig! +1`
                    : `Falsches Jahr — ${activeCard.song.release_year}.`}
                  {nameCorrect !== null && (
                    <span style={{ display: "block", marginTop: "0.25rem" }}>
                      {nameCorrect ? "Song erkannt! +1" : "Song nicht erkannt."}
                    </span>
                  )}
                  {turnScoreDelta > 0 && (
                    <span style={{ display: "block", marginTop: "0.25rem", fontWeight: "bold" }}>
                      Gesamt: +{turnScoreDelta} Punkt{turnScoreDelta > 1 ? "e" : ""}
                    </span>
                  )}
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

            {phase === "naming" && (
              <SongVerifier onResult={handleNamingResult} />
            )}

            {phase === "guessing" && (
              <p className="hint-text">Wähle in der Zeitleiste die richtige Position</p>
            )}
          </div>
        ) : (
          <div className="empty-play-area glass-panel">
            {phase === "done" ? (
              /* "Done" state: show next player button, still see timeline below */
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

      {/* ── Timeline (current player only) ── */}
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
