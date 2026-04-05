"use client";

import React, { useState } from 'react';
import Papa from 'papaparse';
import { searchDeezerTrack } from '@/infrastructure/deezer/DeezerService';
import { supabase } from '@/infrastructure/supabase/supabaseClient';
import type { Song } from '@/core/domain/models';

export const CsvImporter: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [playlistName, setPlaylistName] = useState("New Playlist");

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    const handleImport = async () => {
        if (!file) return;
        setIsImporting(true);
        setLogs([]);
        addLog("Starting import...");

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                addLog(`Parsed ${rows.length} rows from CSV.`);

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
                for (const row of rows) {
                    // Expecting columns: track_name, artist, genre (optional)
                    const trackName = row.track_name || row.title || row.song || row['Track Name'];
                    const artist = row.artist || row['Artist Name(s)'];
                    const genre = row.genre || row.Genres || null;

                    if (!trackName || !artist) {
                        addLog(`Skipping invalid row: missing track or artist. ${JSON.stringify(row)}`);
                        continue;
                    }

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
                        addLog(`Skipping row: missing valid release year. ${trackName} by ${artist}`);
                        continue;
                    }

                    addLog(`Searching Deezer for: "${trackName}" by ${artist}...`);
                    const deezerData = await searchDeezerTrack(trackName, artist);

                    if (!deezerData) {
                        addLog(`⚠️ Could not find Deezer data for: "${trackName}" by ${artist}. Skipping.`);
                        continue;
                    }

                    // Prepare DB payload
                    const songPayload = {
                        playlist_id: playlistData.id,
                        track_name: deezerData.track_name || trackName,
                        artist: deezerData.artist || artist,
                        release_year: csvYear,
                        album: deezerData.album,
                        genre: genre,
                        cover_url: deezerData.cover_url,
                        preview_url: deezerData.preview_url,
                        deezer_id: deezerData.deezer_id
                    };

                    const { error: insertError } = await supabase.from('songs').insert([songPayload]);
                    
                    if (insertError) {
                        addLog(`Error inserting song "${trackName}": ${insertError.message}`);
                    } else {
                        addLog(`✅ Successfully added "${songPayload.track_name}" (${songPayload.release_year})`);
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
                <button 
                    onClick={handleImport} 
                    disabled={!file || isImporting}
                    style={{ padding: '0.75rem', background: isImporting ? '#555' : '#cc97ff', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    {isImporting ? "Importing..." : "Start Import"}
                </button>
            </div>

            <div style={{ background: '#0e0e0e', padding: '1rem', height: '400px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {logs.length === 0 ? <span style={{color: '#555'}}>Logs will appear here...</span> : logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '4px', color: log.startsWith('✅') ? '#8aff8a' : log.startsWith('⚠️') ? '#ffaa00' : '#fff' }}>{log}</div>
                ))}
            </div>
        </div>
    );
};
