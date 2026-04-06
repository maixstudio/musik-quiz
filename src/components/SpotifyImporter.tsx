"use client";

import React, { useState } from "react";
import { supabase } from "@/infrastructure/supabase/supabaseClient";

interface BridgeTrack {
  trackName: string;
  artist: string;
  album: string;
  coverUrl: string;
  previewUrl: string;
  releaseYear: number;
  deezerId: number;
}

export const SpotifyImporter: React.FC = () => {
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleImport = async () => {
    if (!spotifyUrl.trim()) return;
    setIsImporting(true);
    setIsDone(false);
    setLogs([]);

    addLog("🔍 Analyzing Spotify playlist URL...");

    // Step 1: Call our bridge API
    let bridgeData: {
      playlistName: string;
      tracks: BridgeTrack[];
      skipped: string[];
      total: number;
      matched: number;
    };

    try {
      const res = await fetch("/api/spotify-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotifyUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Bridge API error");
      bridgeData = json;
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`);
      setIsImporting(false);
      return;
    }

    addLog(`✅ Found playlist: "${bridgeData.playlistName}" (${bridgeData.total} tracks)`);
    addLog(`   → ${bridgeData.matched} matched on Deezer, ${bridgeData.skipped.length} skipped`);

    if (bridgeData.skipped.length > 0) {
      addLog(`⚠️ Skipped (no Deezer match or missing year):`);
      bridgeData.skipped.forEach((s) => addLog(`   • ${s}`));
    }

    if (bridgeData.tracks.length === 0) {
      addLog("❌ No importable tracks found.");
      setIsImporting(false);
      return;
    }

    // Step 2: Create playlist in Supabase (use name from Spotify if user didn't override)
    const finalName = playlistName.trim() || bridgeData.playlistName;
    addLog(`📀 Creating playlist "${finalName}" in database...`);

    const { data: playlist, error: playlistError } = await supabase
      .from("playlists")
      .insert([{ name: finalName }])
      .select()
      .single();

    if (playlistError || !playlist) {
      addLog(`❌ Could not create playlist: ${playlistError?.message}`);
      setIsImporting(false);
      return;
    }

    addLog(`✅ Playlist created (${playlist.id})`);

    // Step 3: Insert tracks
    let successCount = 0;
    for (const track of bridgeData.tracks) {
      const { error } = await supabase.from("songs").insert([{
        playlist_id: playlist.id,
        track_name: track.trackName,
        artist: track.artist,
        album: track.album,
        cover_url: track.coverUrl,
        preview_url: track.previewUrl,
        release_year: track.releaseYear,
        deezer_id: track.deezerId,
        genre: null,
      }]);

      if (error) {
        addLog(`⚠️ Failed to insert "${track.trackName}": ${error.message}`);
      } else {
        successCount++;
        addLog(`✅ ${track.trackName} – ${track.artist} (${track.releaseYear})`);
      }
    }

    addLog(`🎉 Done! ${successCount} songs imported into "${finalName}".`);
    setIsDone(true);
    setIsImporting(false);
  };

  const logColor = (log: string) => {
    if (log.startsWith("✅")) return "#8aff8a";
    if (log.startsWith("❌")) return "#ff8a8a";
    if (log.startsWith("⚠️")) return "#ffaa00";
    if (log.startsWith("🎉")) return "#cc97ff";
    return "#ccc";
  };

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
        background: "#20201f",
        borderRadius: "1rem",
        border: "1px solid #333",
      }}
    >
      <h2 style={{ color: "#cc97ff", marginBottom: "0.5rem", fontFamily: "Space Grotesk" }}>
        🎵 Spotify Playlist Import
      </h2>
      <p style={{ color: "#888", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        Füge eine öffentliche Spotify-Playlist-URL ein. Die Tracks werden automatisch über Deezer
        angereichert (Cover, Vorschau, Erscheinungsjahr).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          value={spotifyUrl}
          onChange={(e) => setSpotifyUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
          style={{
            padding: "0.6rem 0.8rem",
            background: "#0e0e0e",
            color: "#fff",
            border: "1px solid #555",
            borderRadius: "0.5rem",
            fontFamily: "monospace",
            fontSize: "0.9rem",
          }}
        />
        <input
          type="text"
          value={playlistName}
          onChange={(e) => setPlaylistName(e.target.value)}
          placeholder="Playlist-Name (optional — wird von Spotify übernommen)"
          style={{
            padding: "0.6rem 0.8rem",
            background: "#0e0e0e",
            color: "#fff",
            border: "1px solid #555",
            borderRadius: "0.5rem",
          }}
        />
        <button
          onClick={handleImport}
          disabled={!spotifyUrl.trim() || isImporting}
          style={{
            padding: "0.75rem",
            background: isImporting ? "#555" : "#cc97ff",
            color: "#000",
            border: "none",
            borderRadius: "0.5rem",
            cursor: isImporting ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: "1rem",
            transition: "background 0.2s",
          }}
        >
          {isImporting ? "Importiere..." : "🚀 Import starten"}
        </button>
      </div>

      {/* Log output */}
      <div
        style={{
          background: "#0e0e0e",
          padding: "1rem",
          height: "400px",
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "0.82rem",
          borderRadius: "0.5rem",
          border: "1px solid #222",
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: "#555" }}>Logs erscheinen hier...</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: "3px", color: logColor(log) }}>
              {log}
            </div>
          ))
        )}
      </div>

      {isDone && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <a
            href="/playlists"
            style={{
              display: "inline-block",
              padding: "0.6rem 1.2rem",
              background: "#00ffcc",
              color: "#000",
              borderRadius: "0.5rem",
              fontWeight: "bold",
              textDecoration: "none",
            }}
          >
            → Zu den Playlists
          </a>
        </div>
      )}
    </div>
  );
};
