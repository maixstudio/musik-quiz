"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/infrastructure/supabase/supabaseClient';
import Link from 'next/link';
import type { Playlist } from '@/core/domain/models';

interface PlaylistWithCount extends Playlist {
  song_count: number;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlaylists();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPlaylists();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    const handlePopstate = () => fetchPlaylists();
    window.addEventListener('popstate', handlePopstate);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', handlePopstate);
    };
  }, []);

  const fetchPlaylists = async () => {
    setLoading(true);
    const { data: pData, error: pError } = await supabase.from('playlists').select('*').order('created_at', { ascending: false });
    
    if (pData) {
      // Fetch song counts (in real app, a SQL view or count query is better, but this is fine for prototype)
      const enhanced: PlaylistWithCount[] = [];
      for (const p of pData) {
        const { count, error: cError } = await supabase
          .from('songs')
          .select('*', { count: 'exact', head: true })
          .eq('playlist_id', p.id);
        
        enhanced.push({
          id: p.id,
          name: p.name,
          song_count: count || 0
        });
      }
      setPlaylists(enhanced);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete the playlist "${name}" and all its tracks?`)) return;
    
    // Explicitly delete songs first
    await supabase.from('songs').delete().eq('playlist_id', id);
    const { error } = await supabase.from('playlists').delete().eq('id', id);
    
    if (!error) {
      setPlaylists(prev => prev.filter(p => p.id !== id));
    } else {
      alert("Failed to delete playlist.");
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--neon-primary)' }}>Playlists</h1>
        <Link href="/playlists/import">
          <button className="btn">Import from CSV</button>
        </Link>
      </div>

      {loading && playlists.length === 0 ? (
        <p>Loading playlists...</p>
      ) : playlists.length === 0 ? (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>No playlists found. Import your first one!</p>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Track Count</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 'bold' }}>{p.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.song_count} songs</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <Link href={`/playlists/${p.id}`}>
                        <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>
                          Edit Songs
                        </button>
                      </Link>
                      <button 
                        onClick={() => handleDelete(p.id, p.name)}
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', color: 'var(--error)', borderColor: 'var(--error)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
