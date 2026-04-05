"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/infrastructure/supabase/supabaseClient';
import type { Song, Playlist } from '@/core/domain/models';
import { useRouter } from 'next/navigation';

function TrackAudio({ url }: { url: string }) {
  const [error, setError] = useState(false);
  if (!url) return <span style={{ color: 'var(--error)' }}>No Preview</span>;
  if (error) return <span style={{ color: 'var(--error)' }}>Preview Unavailable</span>;
  return (
    <audio 
      controls 
      src={url} 
      preload="none"
      style={{ height: '30px', width: '200px' }} 
      onError={() => setError(true)} 
    />
  );
}

export default function PlaylistEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = React.use(params);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  // Rename
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // Search and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof Song>('release_year');
  const [sortAsc, setSortAsc] = useState(true);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from('playlists').select('*').eq('id', id).single();
    if (pData) {
      setPlaylist(pData);
      setEditName(pData.name);
    }

    const { data: sData } = await supabase.from('songs').select('*').eq('playlist_id', id);
    if (sData) setSongs(sData);

    setLoading(false);
  };

  const handleUpdateName = async () => {
    if (!editName.trim() || editName === playlist?.name) {
      setIsEditingName(false);
      return;
    }
    const { error } = await supabase.from('playlists').update({ name: editName }).eq('id', id);
    if (!error && playlist) {
      setPlaylist({ ...playlist, name: editName });
    }
    setIsEditingName(false);
  };

  const handleSort = (field: keyof Song) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} songs?`)) return;

    // Delete from DB
    const idsToDelete = Array.from(selectedIds);
    const { error } = await supabase.from('songs').delete().in('id', idsToDelete);
    
    if (!error) {
      // Remove from local state
      setSongs(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } else {
      alert("Error deleting songs.");
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredAndSortedSongs.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // Derived state for rendering
  const filteredAndSortedSongs = songs
    .filter(s => 
      (s.track_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.artist || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.genre || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal === null || aVal === undefined) return sortAsc ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortAsc ? -1 : 1;
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <button 
        className="btn btn-secondary" 
        style={{ marginBottom: '1rem', padding: '0.4rem 1rem' }} 
        onClick={() => router.push('/playlists')}
      >
        ← Back to Playlists
      </button>

      {playlist && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            {isEditingName ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  className="input-base" 
                  value={editName} 
                  onChange={e => setEditName(e.target.value)} 
                  autoFocus 
                  onKeyDown={e => e.key === 'Enter' && handleUpdateName()}
                  onBlur={handleUpdateName}
                />
              </div>
            ) : (
              <h1 
                style={{ color: 'var(--neon-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => setIsEditingName(true)}
                title="Click to rename"
              >
                {playlist.name} ✏️
              </h1>
            )}
            <p style={{ color: 'var(--text-secondary)' }}>{songs.length} total tracks</p>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input 
              className="input-base" 
              placeholder="Search by track, artist, genre..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '300px' }}
            />
            {selectedIds.size > 0 && (
              <button 
                className="btn" 
                style={{ background: 'var(--error)', color: '#fff' }}
                onClick={handleDeleteSelected}
              >
                Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading tracks...</p>
      ) : (
        <div className="glass-panel" style={{ padding: '1rem', overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll}
                    checked={selectedIds.size === filteredAndSortedSongs.length && filteredAndSortedSongs.length > 0}
                  />
                </th>
                <th onClick={() => handleSort('track_name')}>Track {sortField === 'track_name' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('artist')}>Artist {sortField === 'artist' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('release_year')}>Year {sortField === 'release_year' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th onClick={() => handleSort('genre')}>Genre {sortField === 'genre' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedSongs.map(s => (
                <tr key={s.id} onClick={() => toggleSelect(s.id)} style={{ cursor: 'pointer' }}>
                  <td onClick={e => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(s.id)} 
                      onChange={() => toggleSelect(s.id)} 
                    />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{s.track_name}</td>
                  <td>{s.artist}</td>
                  <td>{s.release_year}</td>
                  <td>{s.genre || '-'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <TrackAudio url={s.preview_url || ''} />
                  </td>
                </tr>
              ))}
              {filteredAndSortedSongs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No tracks found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
