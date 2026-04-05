"use client";

import React, { useState, useRef, useEffect } from "react";
import "./SongSearch.css";

export interface Song {
  id: string;
  track_name: string;
  artist: string;
}

interface SongSearchProps {
  allSongs: Song[];
  onMatch: (song: Song) => void; // called when both fields match one unique song
  disabled?: boolean;
}

const normalize = (s: string) => s.toLowerCase().trim();
const includes = (haystack: string, needle: string) =>
  normalize(haystack).includes(normalize(needle));

export const SongSearch: React.FC<SongSearchProps> = ({ allSongs, onMatch, disabled }) => {
  const [titleVal, setTitleVal] = useState("");
  const [artistVal, setArtistVal] = useState("");

  // Which field is showing suggestions
  const [titleSuggestions, setTitleSuggestions] = useState<Song[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<Song[]>([]);
  const [activeSuggestionField, setActiveSuggestionField] = useState<"title" | "artist" | null>(
    null
  );

  const titleRef = useRef<HTMLInputElement>(null);
  const artistRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setActiveSuggestionField(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleTitleChange = (val: string) => {
    setTitleVal(val);
    if (val.length < 1) {
      setTitleSuggestions([]);
      return;
    }
    // Filter by title (also cross-filter with artist if artist is set)
    const filtered = allSongs.filter(
      (s) =>
        includes(s.track_name, val) &&
        (artistVal === "" || includes(s.artist, artistVal))
    );
    // Deduplicate by track_name
    const unique = dedupeBy(filtered, (s) => normalize(s.track_name));
    setTitleSuggestions(unique.slice(0, 8));
    setActiveSuggestionField("title");
  };

  const handleArtistChange = (val: string) => {
    setArtistVal(val);
    if (val.length < 1) {
      setArtistSuggestions([]);
      return;
    }
    const filtered = allSongs.filter(
      (s) =>
        includes(s.artist, val) &&
        (titleVal === "" || includes(s.track_name, titleVal))
    );
    const unique = dedupeBy(filtered, (s) => normalize(s.artist));
    setArtistSuggestions(unique.slice(0, 8));
    setActiveSuggestionField("artist");
  };

  const selectSuggestion = (song: Song, field: "title" | "artist") => {
    if (field === "title") {
      setTitleVal(song.track_name);
      setTitleSuggestions([]);
      // If artist already partly filled, keep it; else fill from song
      if (artistVal === "") setArtistVal(song.artist);
    } else {
      setArtistVal(song.artist);
      setArtistSuggestions([]);
      if (titleVal === "") setTitleVal(song.track_name);
    }
    setActiveSuggestionField(null);
    tryMatch(
      field === "title" ? song.track_name : titleVal,
      field === "artist" ? song.artist : artistVal,
      song
    );
  };

  const tryMatch = (title: string, artist: string, forcedSong?: Song) => {
    if (forcedSong) {
      onMatch(forcedSong);
      return;
    }
    if (!title || !artist) return;
    const match = allSongs.find(
      (s) => includes(s.track_name, title) && normalize(s.track_name) === normalize(title) &&
            includes(s.artist, artist) && normalize(s.artist) === normalize(artist)
    );
    if (match) onMatch(match);
  };

  const handleSubmit = () => {
    tryMatch(titleVal, artistVal);
  };

  return (
    <div className="song-search-root" ref={containerRef}>
      <div className="song-search-fields">
        {/* Title field */}
        <div className="song-search-field-wrap">
          <label className="song-search-label">🎵 Titel</label>
          <input
            ref={titleRef}
            className="song-search-input"
            value={titleVal}
            placeholder="z.B. With a Little Help..."
            disabled={disabled}
            onChange={(e) => handleTitleChange(e.target.value)}
            onFocus={() => titleVal && setActiveSuggestionField("title")}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoComplete="off"
          />
          {activeSuggestionField === "title" && titleSuggestions.length > 0 && (
            <ul className="song-search-dropdown">
              {titleSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="song-search-suggestion"
                  onMouseDown={() => selectSuggestion(s, "title")}
                >
                  <span className="sug-title">{s.track_name}</span>
                  <span className="sug-artist">{s.artist}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Artist field */}
        <div className="song-search-field-wrap">
          <label className="song-search-label">🎤 Interpret</label>
          <input
            ref={artistRef}
            className="song-search-input"
            value={artistVal}
            placeholder="z.B. Joe Cocker"
            disabled={disabled}
            onChange={(e) => handleArtistChange(e.target.value)}
            onFocus={() => artistVal && setActiveSuggestionField("artist")}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoComplete="off"
          />
          {activeSuggestionField === "artist" && artistSuggestions.length > 0 && (
            <ul className="song-search-dropdown">
              {artistSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="song-search-suggestion"
                  onMouseDown={() => selectSuggestion(s, "artist")}
                >
                  <span className="sug-artist-main">{s.artist}</span>
                  <span className="sug-title-sub">{s.track_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button
        className="song-search-btn"
        disabled={disabled || (!titleVal && !artistVal)}
        onClick={handleSubmit}
      >
        ✓ Lösung eingeben
      </button>
    </div>
  );
};

// Dedup helpers
function dedupeBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
