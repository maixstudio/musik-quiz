"use server";

import type { Song } from "@/core/domain/models";

export interface DeezerTrackData {
  id: number;
  title: string;
  artist: { name: string; id: number };
  album: { title: string; cover_xl: string };
  preview: string;
  release_date?: string; // Optional depending on the endpoint used
}

// Ensure the caller executes this in a server context (Server Action) to avoid CORS
export async function searchDeezerTrack(trackName: string, artistName: string): Promise<Partial<Song> | null> {
  try {
    const query = `track:"${trackName}" artist:"${artistName}"`;
    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.data && data.data.length > 0) {
      const track: DeezerTrackData = data.data[0];
      
      return {
        track_name: track.title,
        artist: track.artist.name,
        album: track.album.title,
        cover_url: track.album.cover_xl,
        preview_url: track.preview,
        deezer_id: track.id
      };
    }
  } catch (error) {
    console.error("Deezer fetch error:", error);
  }
  
  return null;
}
