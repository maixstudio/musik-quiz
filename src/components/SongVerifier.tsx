"use client";

import React, { useState } from "react";

export interface NamingResult {
  titleCorrect: boolean;
  artistCorrect: boolean;
  titleInput: string;
  artistInput: string;
}

interface SongVerifierProps {
  song: { track_name: string; artist: string };
  onResult: (result: NamingResult) => void;
}

export const SongVerifier: React.FC<SongVerifierProps> = ({ song, onResult }) => {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (isLoading) return;

    const titleInput = title.trim();
    const artistInput = artist.trim();

    if (!titleInput && !artistInput) {
      onResult({ titleCorrect: false, artistCorrect: false, titleInput: "", artistInput: "" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/verify-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleInput,
          artistInput,
          correctTitle: song.track_name,
          correctArtist: song.artist,
        }),
      });
      const data = await res.json();
      onResult({
        titleCorrect: !!data.titleCorrect,
        artistCorrect: !!data.artistCorrect,
        titleInput,
        artistInput,
      });
    } catch {
      onResult({ titleCorrect: false, artistCorrect: false, titleInput, artistInput });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleSubmit();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
      <p style={{ fontSize: "1.1rem", fontWeight: "600", margin: 0 }}>Weißt du welcher Song das ist?</p>
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Titel eingeben..."
        disabled={isLoading}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        style={{
          padding: "1rem", fontSize: "1.3rem", lineHeight: "1.5",
          background: "#0e0e0e", color: "#fff", border: "2px solid #555",
          borderRadius: "6px", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
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
        spellCheck={false}
        style={{
          padding: "1rem", fontSize: "1.3rem", lineHeight: "1.5",
          background: "#0e0e0e", color: "#fff", border: "2px solid #555",
          borderRadius: "6px", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        style={{
          padding: "1rem 2rem", fontSize: "1.2rem",
          background: isLoading ? "#555" : "#cc97ff", color: "#000",
          border: "none", borderRadius: "6px", fontWeight: "bold",
          cursor: isLoading ? "default" : "pointer",
        }}
      >
        {isLoading ? "⏳ Prüfe..." : "✓ Bestätigen & zur Timeline"}
      </button>
    </div>
  );
};
