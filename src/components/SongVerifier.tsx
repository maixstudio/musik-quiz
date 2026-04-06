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

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px 1fr 1fr auto",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.6rem 0.75rem",
  background: "#1a1a1a",
  borderRadius: "6px",
};

const labelStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "0.85rem",
  fontWeight: 600,
};

const valueStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: "0.95rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const correctStyle: React.CSSProperties = { color: "#8aff8a", fontSize: "0.95rem" };
const wrongStyle: React.CSSProperties = { color: "#ff8a8a", fontSize: "0.95rem" };

function ToggleButton({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      title="Klicken zum Ändern"
      style={{
        padding: "0.3rem 0.65rem",
        fontSize: "1rem",
        background: value ? "#1a3a1a" : "#3a1a1a",
        border: `1px solid ${value ? "#4caf50" : "#f44336"}`,
        borderRadius: "4px",
        cursor: "pointer",
        lineHeight: 1,
        color: value ? "#8aff8a" : "#ff8a8a",
        fontWeight: "bold",
        minWidth: "40px",
        textAlign: "center",
      }}
    >
      {value ? "✓" : "✗"}
    </button>
  );
}

export const SongVerifier: React.FC<SongVerifierProps> = ({ song, onResult }) => {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ titleCorrect: boolean; artistCorrect: boolean } | null>(null);
  const [titleCorrect, setTitleCorrect] = useState(false);
  const [artistCorrect, setArtistCorrect] = useState(false);

  const handleSubmit = async () => {
    if (isLoading) return;

    if (!title.trim() && !artist.trim()) {
      onResult({ titleCorrect: false, artistCorrect: false, titleInput: "", artistInput: "" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/verify-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), artist: artist.trim() }),
      });
      const data = await res.json();

      // KI vergleicht Eingabe mit DB-Werten
      const aiTitleOk = title.trim()
        ? (data.correctedTitle || "").toLowerCase().includes(song.track_name.toLowerCase()) ||
          song.track_name.toLowerCase().includes((data.correctedTitle || "").toLowerCase()) ||
          !!data.isValid
        : false;
      const aiArtistOk = artist.trim()
        ? (data.correctedArtist || "").toLowerCase().includes(song.artist.toLowerCase()) ||
          song.artist.toLowerCase().includes((data.correctedArtist || "").toLowerCase()) ||
          !!data.isValid
        : false;

      setTitleCorrect(aiTitleOk);
      setArtistCorrect(aiArtistOk);
      setAiResult({ titleCorrect: aiTitleOk, artistCorrect: aiArtistOk });
    } catch {
      setTitleCorrect(false);
      setArtistCorrect(false);
      setAiResult({ titleCorrect: false, artistCorrect: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    onResult({ titleCorrect, artistCorrect, titleInput: title.trim(), artistInput: artist.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading && !aiResult) handleSubmit();
  };

  if (aiResult !== null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
        <p style={{ fontSize: "1rem", fontWeight: 600, color: "#cc97ff", margin: 0 }}>
          Auswertung — Klicke ✓/✗ zum Korrigieren
        </p>

        {/* Titel row */}
        <div style={rowStyle}>
          <span style={labelStyle}>Titel</span>
          <span style={valueStyle} title={title || "—"}>
            <span style={{ color: "#888", fontSize: "0.75rem" }}>Du: </span>
            {title || <em style={{ color: "#555" }}>keine Eingabe</em>}
          </span>
          <span style={valueStyle} title={song.track_name}>
            <span style={{ color: "#888", fontSize: "0.75rem" }}>Richtig: </span>
            <span style={titleCorrect ? correctStyle : wrongStyle}>{song.track_name}</span>
          </span>
          <ToggleButton value={titleCorrect} onChange={setTitleCorrect} />
        </div>

        {/* Interpret row */}
        <div style={rowStyle}>
          <span style={labelStyle}>Interpret</span>
          <span style={valueStyle} title={artist || "—"}>
            <span style={{ color: "#888", fontSize: "0.75rem" }}>Du: </span>
            {artist || <em style={{ color: "#555" }}>keine Eingabe</em>}
          </span>
          <span style={valueStyle} title={song.artist}>
            <span style={{ color: "#888", fontSize: "0.75rem" }}>Richtig: </span>
            <span style={artistCorrect ? correctStyle : wrongStyle}>{song.artist}</span>
          </span>
          <ToggleButton value={artistCorrect} onChange={setArtistCorrect} />
        </div>

        <button
          onClick={handleConfirm}
          style={{
            padding: "0.85rem 2rem",
            fontSize: "1.1rem",
            background: "#cc97ff",
            color: "#000",
            border: "none",
            borderRadius: "6px",
            fontWeight: "bold",
            cursor: "pointer",
            marginTop: "0.25rem",
          }}
        >
          → Weiter zur Timeline
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
      <p style={{ fontSize: "1.1rem", fontWeight: "600", margin: 0 }}>Weißt du welcher Song das ist?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
          {isLoading ? "⏳ Prüfe..." : "✓ Bestätigen"}
        </button>
      </div>
    </div>
  );
};
