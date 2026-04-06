"use client";

import React, { useState } from "react";

interface SongVerifierProps {
  onResult: (isValid: boolean) => void;
}

export const SongVerifier: React.FC<SongVerifierProps> = ({ onResult }) => {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  const handleSubmit = async () => {
    if (isLoading) return;

    // Both empty → skip, no points
    if (!title.trim() && !artist.trim()) {
      setResult(false);
      onResult(false);
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/verify-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), artist: artist.trim() }),
      });
      const data = await res.json();
      const isValid = !!data.isValid;
      setResult(isValid);
      onResult(isValid);
    } catch {
      setResult(false);
      onResult(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismissResult = () => {
    setResult(null);
    setTitle("");
    setArtist("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading && result === null) handleSubmit();
  };

  return (
    <div className="song-verifier" style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
      <p className="verifier-label" style={{ fontSize: "1.1rem", fontWeight: "600" }}>Weißt du welcher Song das ist?</p>

      {result === null ? (
        <div className="verifier-fields" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Titel eingeben..."
            disabled={isLoading}
            autoFocus
            autoComplete="off"
            spellCheck="false"
            className="verifier-input"
            style={{
              padding: "1rem",
              fontSize: "1.3rem",
              lineHeight: "1.5",
              background: "#0e0e0e",
              color: "#fff",
              border: "2px solid #555",
              borderRadius: "6px",
              fontFamily: "inherit",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <input
            type="text"
            value={artist}
            onChange={e => setArtist(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Interpret eingeben..."
            disabled={isLoading}
            autoComplete="off"
            spellCheck="false"
            className="verifier-input"
            style={{
              padding: "1rem",
              fontSize: "1.3rem",
              lineHeight: "1.5",
              background: "#0e0e0e",
              color: "#fff",
              border: "2px solid #555",
              borderRadius: "6px",
              fontFamily: "inherit",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn verifier-btn"
            style={{
              padding: "1rem 2rem",
              fontSize: "1.2rem",
              background: isLoading ? "#555" : "#cc97ff",
              color: "#000",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              cursor: isLoading ? "default" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {isLoading ? "⏳ Prüfe..." : "✓ Bestätigen"}
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: "1rem",
            borderRadius: "0.5rem",
            background: result ? "#0d2b0d" : "#2b0d0d",
            border: `2px solid ${result ? "#4caf50" : "#f44336"}`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.3rem", fontWeight: "bold", color: result ? "#8aff8a" : "#ff8a8a", marginBottom: "0.75rem" }}>
            {result ? "✅ Richtig!" : "❌ Falsch!"}
          </div>
          <p style={{ color: "#ddd", marginBottom: "1rem" }}>
            {result ? "Du hast den Song erkannt!" : `Nein — "${title}" von "${artist}" ist nicht korrekt.`}
          </p>
          <button
            onClick={handleDismissResult}
            className="btn"
            style={{
              padding: "0.85rem 2rem",
              fontSize: "1.1rem",
              background: "#cc97ff",
              color: "#000",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              cursor: "pointer",
              marginTop: "0.5rem",
            }}
          >
            → Weiter
          </button>
        </div>
      )}
    </div>
  );
};
