export interface Song {
  id: string;
  playlist_id: string;
  track_name: string;
  artist: string;
  release_year: number;
  album: string | null;
  genre: string | null;
  cover_url: string | null;
  preview_url: string | null;
  deezer_id: number | null;
}

export interface Playlist {
  id: string;
  name: string;
}

export type Player = {
  id: string;
  name: string;
  score: number;
};

// Represents a card on the timeline
export interface TimelineCard {
  song: Song;
  // State 0: in deck, 1: active (hidden), 2: placed (revealed)
  status: 'hidden' | 'revealed'; 
}

export type GamePhase = 'IDLE' | 'SPINNING' | 'LISTENING' | 'PLACING' | 'RESOLVING' | 'NEXT_TURN' | 'GAME_OVER';

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  playlistId: string | null;
  
  // Available genres left in the selected playlist
  availableGenres: string[];
  activeGenre: string | null;

  // Timeline
  timeline: TimelineCard[];
  activeCard: TimelineCard | null;
  
  phase: GamePhase;
  targetScore: number;
}
