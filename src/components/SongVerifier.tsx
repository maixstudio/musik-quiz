"use client";

import React, { useState } from "react";

interface SongVerifierProps {
  onResult: (isValid: boolean) => void;
}

export const SongVerifier: React.FC<SongVerifierProps> = ({ onResult }) => {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !artist.trim() || isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/verify-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), artist: artist.trim() }),
      });
      const data = await res.json();
      onResult(!!data.isValid);
    } catch {
      onResult(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="song-verifier">
      <p className="verifier-label">Weißt du welcher Song das ist?</p>
      <div className="verifier-fields">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Titel"
          disabled={isLoading}
          autoFocus
          className="verifier-input"
        />
        <input
          type="text"
          value={artist}
          onChange={e => setArtist(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Interpret"
          disabled={isLoading}
          className="verifier-input"
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading || !title.trim() || !artist.trim()}
          className="btn verifier-btn"
        >
          {isLoading ? "Prüfe..." : "Bestätigen"}
        </button>
      </div>
    </div>
  );
};
