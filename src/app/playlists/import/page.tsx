"use client";

import { useState } from "react";
import { CsvImporter } from "@/components/CsvImporter";
import { SpotifyImporter } from "@/components/SpotifyImporter";

type Tab = "spotify" | "csv";

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<Tab>("spotify");

  const tabStyle = (t: Tab) => ({
    padding: "0.6rem 1.5rem",
    cursor: "pointer" as const,
    border: "none",
    borderRadius: "0.5rem 0.5rem 0 0",
    fontFamily: "Space Grotesk, sans-serif",
    fontWeight: "bold" as const,
    fontSize: "0.95rem",
    background: activeTab === t ? "#20201f" : "transparent",
    color: activeTab === t ? "#cc97ff" : "#666",
    borderBottom: activeTab === t ? "2px solid #cc97ff" : "2px solid transparent",
    transition: "all 0.2s",
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1rem",
        background: "radial-gradient(circle at top, #1a0a2e 0%, #0e0e0e 60%)",
      }}
    >
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <a
          href="/playlists"
          style={{
            color: "#666",
            fontSize: "0.85rem",
            textDecoration: "none",
            display: "block",
            marginBottom: "1.5rem",
          }}
        >
          ← Zurück zu Playlists
        </a>

        <h1
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            color: "#cc97ff",
            marginBottom: "2rem",
            fontSize: "1.8rem",
          }}
        >
          Playlist importieren
        </h1>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #333",
            marginBottom: "-1px",
          }}
        >
          <button style={tabStyle("spotify")} onClick={() => setActiveTab("spotify")}>
            🎵 Spotify URL
          </button>
          <button style={tabStyle("csv")} onClick={() => setActiveTab("csv")}>
            📄 CSV Datei
          </button>
        </div>

        {/* Tab content */}
        <div style={{ marginTop: "0" }}>
          {activeTab === "spotify" ? <SpotifyImporter /> : <CsvImporter />}
        </div>
      </div>
    </main>
  );
}
