"use client";

import React, { useState, useEffect } from "react";
import { GameBoard } from "@/components/GameBoard";
import { supabase } from "@/infrastructure/supabase/supabaseClient";
import type { Playlist, Player } from "@/core/domain/models";
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  
  const [players, setPlayers] = useState<Player[]>([
    { id: uuidv4(), name: 'Player 1', score: 0 },
    { id: uuidv4(), name: 'Player 2', score: 0 }
  ]);

  const [isGameStarted, setIsGameStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    const { data } = await supabase.from('playlists').select('*');
    if (data) {
      setPlaylists(data);
      if (data.length > 0) setSelectedPlaylistId(data[0].id);
    }
    setLoading(false);
  };

  const handleAddPlayer = () => {
    setPlayers([...players, { id: uuidv4(), name: `Player ${players.length + 1}`, score: 0 }]);
  };

  const handleUpdatePlayerName = (id: string, name: string) => {
    setPlayers(players.map(p => p.id === id ? { ...p, name } : p));
  };

  const handleRemovePlayer = (id: string) => {
    if (players.length <= 1) return;
    setPlayers(players.filter(p => p.id !== id));
  };

  const handleStartGame = () => {
    if (!selectedPlaylistId) return;
    if (players.filter(p => p.name.trim() !== '').length === 0) return;
    
    setIsGameStarted(true);
  };

  if (isGameStarted) {
    return (
      <main>
        <GameBoard 
          playlistId={selectedPlaylistId} 
          players={players.filter(p => p.name.trim() !== '')} 
          onEndGame={() => setIsGameStarted(false)} 
        />
      </main>
    );
  }

  return (
    <main style={{ padding: '4rem 2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '3rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: 'var(--neon-primary)', marginBottom: '0.5rem' }}>Game Lobby</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Setup your match</p>
        </div>

        <div>
          <h3 style={{ marginBottom: '1rem', color: 'var(--neon-secondary)' }}>1. Select Playlist</h3>
          {loading ? (
            <p>Loading playlists...</p>
          ) : playlists.length === 0 ? (
            <p style={{ color: 'var(--error)' }}>No playlists available. Please create one in the Playlists tab.</p>
          ) : (
            <select 
              className="input-base" 
              style={{ width: '100%' }}
              value={selectedPlaylistId}
              onChange={e => setSelectedPlaylistId(e.target.value)}
            >
              {playlists.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: 'var(--neon-secondary)' }}>2. Players</h3>
            <button onClick={handleAddPlayer} className="btn btn-secondary" style={{ padding: '0.2rem 0.8rem', fontSize: '0.8rem' }}>+ Add Player</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {players.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  className="input-base" 
                  style={{ flex: 1 }}
                  value={p.name}
                  onChange={e => handleUpdatePlayerName(p.id, e.target.value)}
                  placeholder={`Player ${i + 1}`}
                />
                <button 
                  onClick={() => handleRemovePlayer(p.id)} 
                  className="btn btn-secondary"
                  style={{ color: 'var(--error)', borderColor: 'var(--error)', padding: '0 1rem' }}
                  disabled={players.length <= 1}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>

        <button 
          className="btn" 
          style={{ width: '100%', marginTop: '1rem', padding: '1rem', fontSize: '1.1rem' }}
          onClick={handleStartGame}
          disabled={!selectedPlaylistId || playlists.length === 0}
        >
          START GAME
        </button>
      </div>
    </main>
  );
}
