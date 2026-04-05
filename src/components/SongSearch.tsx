"use client";

import React, { useState, useRef, useEffect } from "react";
import "./SongSearch.css";

export interface Song {
  id: string;
  track_name: string;
  artist: string;
}

export interface GuessResult {
  titleInput: string;
  artistInput: string;
  titleCorrect: boolean;
  artistCorrect: boolean;
}

interface SongSearchProps {
  /** The active song the player is trying to guess */
  activeSong: Song;
  /** All songs in the playlist — for autocomplete lookups */
  allSongs: Song[];
  /**
   * Called when player clicks "Weiter →".
   * Passes the guess (title/artist can be empty strings if not entered).
   */
  onConfirm: (result: GuessResult) => void;
  disabled?: boolean;
}

const normalize = (s: string) => s.toLowerCase().trim();
const partialMatch = (haystack: string, needle: string) =>
  normalize(haystack).includes(normalize(needle));

function dedupeBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const SongSearch: React.FC<SongSearchProps> = ({
  activeSong,
  allSongs,
  onConfirm,
  disabled,
}) => {
  const [titleVal, setTitleVal] = useState("");
  const [artistVal, setArtistVal] = useState("");
  const [titleSugs, setTitleSugs] = useState<string[]>([]);
  const [artistSugs, setArtistSugs] = useState<string[]>([]);
  const [openFor, setOpenFor] = useState<"title" | "artist" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenFor(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Title search — ONLY titles shown ─────────────────────────────────────
  const handleTitleChange = (val: string) => {
    setTitleVal(val);
    if (val.length < 1) { setTitleSugs([]); return; }
    const filtered = allSongs.filter((s) => partialMatch(s.track_name, val)).map((s) => s.track_name);
    setTitleSugs(dedupeBy(filtered, normalize).slice(0, 8));
    setOpenFor("title");
  };

  // ── Artist search — ONLY artist names shown ───────────────────────────────
  const handleArtistChange = (val: string) => {
    setArtistVal(val);
    if (val.length < 1) { setArtistSugs([]); return; }
    const filtered = allSongs.filter((s) => partialMatch(s.artist, val)).map((s) => s.artist);
    setArtistSugs(dedupeBy(filtered, normalize).slice(0, 8));
    setOpenFor("artist");
  };

  const pickTitle = (title: string) => {
    setTitleVal(title);
    setTitleSugs([]);
    setOpenFor(null);
  };

  const pickArtist = (artist: string) => {
    setArtistVal(artist);
    setArtistSugs([]);
    setOpenFor(null);
  };

  /** Lock in whatever was typed (or nothing) and proceed to placement step */
  const handleConfirm = () => {
    setOpenFor(null);
    const titleCorrect = normalize(titleVal) === normalize(activeSong.track_name);
    const artistCorrect = normalize(artistVal) === normalize(activeSong.artist);
    onConfirm({ titleInput: titleVal, artistInput: artistVal, titleCorrect, artistCorrect });
  };

  return (
    <div className="song-search-root" ref={containerRef}>
      <div className="song-search-fields">
        {/* Title field */}
        <div className="song-search-field-wrap">
          <label className="song-search-label">🎵 Titel</label>
          <input
            className="song-search-input"
            value={titleVal}
            placeholder="Songtitel (optional)..."
            disabled={disabled}
            onChange={(e) => handleTitleChange(e.target.value)}
            onFocus={() => titleVal && setOpenFor("title")}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setTitleSugs([]); setOpenFor(null); }
            }}
            autoComplete="off"
          />
          {openFor === "title" && titleSugs.length > 0 && (
            <ul className="song-search-dropdown">
              {titleSugs.map((title, i) => (
                <li key={i} className="song-search-suggestion" onMouseDown={() => pickTitle(title)}>
                  <span className="sug-primary">{title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Artist field */}
        <div className="song-search-field-wrap">
          <label className="song-search-label">🎤 Interpret</label>
          <input
            className="song-search-input"
            value={artistVal}
            placeholder="Künstler (optional)..."
            disabled={disabled}
            onChange={(e) => handleArtistChange(e.target.value)}
            onFocus={() => artistVal && setOpenFor("artist")}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setArtistSugs([]); setOpenFor(null); }
            }}
            autoComplete="off"
          />
          {openFor === "artist" && artistSugs.length > 0 && (
            <ul className="song-search-dropdown">
              {artistSugs.map((artist, i) => (
                <li key={i} className="song-search-suggestion" onMouseDown={() => pickArtist(artist)}>
                  <span className="sug-primary">{artist}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button
        className="song-search-btn"
        disabled={disabled}
        onClick={handleConfirm}
      >
        Weiter →
      </button>
    </div>
  );
};
