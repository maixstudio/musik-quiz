"use client";

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { searchDeezerTrack } from '@/infrastructure/deezer/DeezerService';
import { supabase } from '@/infrastructure/supabase/supabaseClient';
import type { Song } from '@/core/domain/models';
import type { EnrichSongResponse } from '@/app/api/enrich-song/route';

async function enrichSongWithAI(
  track_name: string,
  artist: string,
  release_year: number
): Promise<{ data: EnrichSongResponse | null; error: string | null }> {
  try {
    const res = await fetch('/api/enrich-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_name, artist, release_year }),
    });
    const json = await res.json();
    if (!res.ok) {
      return { data: null, error: json.error || json.details || `HTTP ${res.status}` };
    }
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export const CsvImporter: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [playlistName, setPlaylistName] = useState("New Playlist");
    const abortRef = useRef(false);

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    const handleAbort = () => {
        abortRef.current = true;
        addLog("⛔ Import wird abgebrochen...");
    };

    const handleImport = async () => {
        if (!file) return;
        abortRef.current = false;
        setIsImporting(true);
        setLogs([]);
        addLog("Starting import...");

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                addLog(`✅ Parsed ${rows.length} rows from CSV.`);
                addLog(`Processing will begin...`);

                // 1. Create Playlist
                const { data: playlistData, error: playlistError } = await supabase
                    .from('playlists')
                    .insert([{ name: playlistName }])
                    .select()
                    .single();

                if (playlistError || !playlistData) {
                    addLog(`Error creating playlist: ${playlistError?.message}`);
                    setIsImporting(false);
                    return;
                }

                addLog(`Created playlist: "${playlistData.name}" (${playlistData.id})`);

                // 2. Process each row
                let processedCount = 0;
                for (const row of rows) {
                    // Expecting columns: track_name, artist, genre (optional)
                    const trackName = row.track_name || row.title || row.song || row['Track Name'];
                    const artist = row.artist || row['Artist Name(s)'];
                    const genre = row.genre || row.Genres || null;

                    if (!trackName || !artist) {
                        addLog(`⏭️ Row ${processedCount + 1}: Skipping — missing track or artist`);
                        continue;
                    }

                    processedCount++;
                    if (abortRef.current) {
                        addLog(`⛔ Import abgebrochen nach ${processedCount - 1} Songs.`);
                        setIsImporting(false);
                        return;
                    }
                    addLog(`---`);

                    let csvYear = null;
                    const csvReleaseDate = row.release_date || row['Release Date'];
                    if (csvReleaseDate) {
                        const parsedDate = new Date(csvReleaseDate);
                        if (!isNaN(parsedDate.getTime())) {
                            csvYear = parsedDate.getFullYear();
                        } else {
                            const match = csvReleaseDate.match(/\d{4}/);
                            if (match) csvYear = parseInt(match[0], 10);
                        }
                    }

                    if (!csvYear) {
                        addLog(`⏭️ Row ${processedCount}: Skipping — missing valid release year`);
                        continue;
                    }

                    addLog(`Row ${processedCount}: 🔍 Deezer lookup: "${trackName}" by "${artist}"...`);
                    const deezerData = await searchDeezerTrack(trackName, artist);

                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (!deezerData) {
                        addLog(`Row ${processedCount}: ⚠️ Deezer not found. Skipping.`);
                        continue;
                    }

                    addLog(`Row ${processedCount}: ✅ Deezer found — "${deezerData.track_name}" by "${deezerData.artist}"`);

                    // KI-Bereinigung
                    const rawTitle = deezerData.track_name || trackName;
                    const rawArtist = deezerData.artist || artist;
                    addLog(`Row ${processedCount}: 🤖 AI enriching...`);
                    const { data: aiData, error: aiError } = await enrichSongWithAI(rawTitle, rawArtist, csvYear);

                    // Small delay after AI call
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (aiError) {
                        addLog(`Row ${processedCount}: ⚠️ AI error: ${aiError}. Using raw data.`);
                    } else if (!aiData) {
                        addLog(`Row ${processedCount}: ⚠️ AI returned empty response. Using raw data.`);
                    } else if (!aiData.found) {
                        addLog(`Row ${processedCount}: ❌ AI: Song not found in knowledge base. Skipping.`);
                        if (aiData.note) addLog(`       Note: ${aiData.note}`);
                        continue;
                    } else {
                        addLog(`Row ${processedCount}: ✅ AI verified. Categories: ${aiData.categories}`);
                        if (aiData.note) addLog(`       AI note: ${aiData.note}`);
                    }

                    const finalTitle = aiData?.found ? aiData.track_name : rawTitle;
                    const finalArtist = aiData?.found ? aiData.artist : rawArtist;
                    const finalYear = aiData?.found ? aiData.release_year : csvYear;
                    const finalCategories = aiData?.found ? aiData.categories : (genre || null);

                    // Prepare DB payload
                    const songPayload = {
                        playlist_id: playlistData.id,
                        track_name: finalTitle,
                        artist: finalArtist,
                        release_year: finalYear,
                        album: deezerData.album,
                        genre: finalCategories,
                        cover_url: deezerData.cover_url,
                        preview_url: deezerData.preview_url,
                        deezer_id: deezerData.deezer_id
                    };

                    const { error: insertError } = await supabase.from('songs').insert([songPayload]);

                    if (insertError) {
                        addLog(`Row ${processedCount}: ❌ DB Insert failed: ${insertError.message}`);
                    } else {
                        addLog(`Row ${processedCount}: ✅ DB saved — "${songPayload.track_name}" (${songPayload.release_year})`);
                    }
                }

                addLog("🎉 Import process finished!");
                setIsImporting(false);
            },
            error: (error) => {
                addLog(`Parse Error: ${error.message}`);
                setIsImporting(false);
            }
        });
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', background: '#20201f', borderRadius: '1rem', border: '1px solid #333' }}>
            <h2 style={{ color: '#cc97ff', marginBottom: '1rem', fontFamily: 'Space Grotesk' }}>Playlist CSV Import</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                <input 
                    type="text" 
                    value={playlistName} 
                    onChange={e => setPlaylistName(e.target.value)} 
                    placeholder="Playlist Name" 
                    style={{ padding: '0.5rem', background: '#0e0e0e', color: '#fff', border: '1px solid #555' }}
                />
                <input 
                    type="file" 
                    accept=".csv" 
                    onChange={e => setFile(e.target.files?.[0] || null)} 
                    style={{ padding: '0.5rem', background: '#0e0e0e', color: '#fff', border: '1px solid #555' }}
                />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={handleImport}
                        disabled={!file || isImporting}
                        style={{ flex: 1, padding: '0.75rem', background: isImporting ? '#555' : '#cc97ff', color: '#000', border: 'none', cursor: isImporting ? 'default' : 'pointer', fontWeight: 'bold' }}
                    >
                        {isImporting ? "Importing..." : "Start Import"}
                    </button>
                    {isImporting && (
                        <button
                            onClick={handleAbort}
                            style={{ padding: '0.75rem 1.25rem', background: '#ff4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            ⛔ Abbrechen
                        </button>
                    )}
                </div>
            </div>

            <div style={{ background: '#0e0e0e', padding: '1rem', height: '400px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {logs.length === 0 ? <span style={{color: '#555'}}>Logs will appear here...</span> : logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '4px', color: log.startsWith('✅') ? '#8aff8a' : log.startsWith('⚠️') ? '#ffaa00' : '#fff' }}>{log}</div>
                ))}
            </div>
        </div>
    );
};
