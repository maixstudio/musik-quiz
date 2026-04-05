import { NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScrapedTrack {
  trackName: string;
  artist: string;
}

interface DeezerResult {
  deezerId: number;
  trackName: string;
  artist: string;
  album: string;
  coverUrl: string;
  previewUrl: string;
  releaseYear: number | null;
}

interface BridgeTrack {
  trackName: string;
  artist: string;
  album: string;
  coverUrl: string;
  previewUrl: string;
  releaseYear: number | null;
  deezerId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts playlist ID from various Spotify URL formats:
 *  - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo7MMrM
 *  - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo7MMrM?si=xxx
 *  - spotify:playlist:37i9dQZF1DXcBWIGo7MMrM
 */
function extractPlaylistId(url: string): string | null {
  const webMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (webMatch) return webMatch[1];
  const uriMatch = url.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
}

/**
 * Scrapes Spotify's open playlist page and extracts track data from __NEXT_DATA__.
 * No Spotify API key required.
 */
async function scrapeSpotifyPlaylist(playlistUrl: string): Promise<{
  playlistName: string;
  tracks: ScrapedTrack[];
}> {
  // Normalize URL to open.spotify.com web format
  const id = extractPlaylistId(playlistUrl);
  if (!id) throw new Error("Could not parse Spotify playlist ID from URL.");

  const url = `https://open.spotify.com/playlist/${id}`;
  console.log(`[SpotifyBridge] Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      // Pretend to be a regular browser (required for Spotify to serve HTML)
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Spotify returned HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();

  // ── Strategy 1: Parse __NEXT_DATA__ (most reliable) ──────────────────────
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const serverData =
        nextData?.props?.pageProps?.state?.data?.playlist ??
        nextData?.props?.pageProps?.data?.playlist;

      if (serverData) {
        const playlistName: string = serverData.name ?? "Imported Playlist";
        const items: any[] = serverData.content?.items ?? serverData.tracks?.items ?? [];
        const tracks: ScrapedTrack[] = [];

        for (const item of items) {
          // Different Spotify page structures
          const trackData = item?.track ?? item?.itemV2?.data ?? item;
          const name: string | undefined =
            trackData?.name ?? trackData?.trackUnion?.name;
          const artistsRaw: any[] =
            trackData?.artists?.items ??
            trackData?.trackUnion?.firstArtist?.items ??
            trackData?.artists ??
            [];
          const artistName: string | undefined =
            artistsRaw[0]?.profile?.name ?? artistsRaw[0]?.name;

          if (name && artistName) {
            tracks.push({ trackName: name, artist: artistName });
          }
        }

        if (tracks.length > 0) {
          console.log(`[SpotifyBridge] __NEXT_DATA__ found ${tracks.length} tracks.`);
          return { playlistName, tracks };
        }
      }
    } catch (e) {
      console.warn("[SpotifyBridge] __NEXT_DATA__ parse failed:", e);
    }
  }

  // ── Strategy 2: Parse JSON-LD (limited data, but no JS needed) ───────────
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const match of jsonLdMatches) {
    try {
      const ld = JSON.parse(match[1]);
      if (ld?.["@type"] === "MusicPlaylist" || ld?.numTracks) {
        const playlistName: string = ld.name ?? "Imported Playlist";
        const tracks: ScrapedTrack[] = (ld.track ?? []).map((t: any) => ({
          trackName: t.name,
          artist: t.byArtist?.name ?? "",
        })).filter((t: ScrapedTrack) => t.trackName && t.artist);

        if (tracks.length > 0) {
          console.log(`[SpotifyBridge] JSON-LD found ${tracks.length} tracks.`);
          return { playlistName, tracks };
        }
      }
    } catch {}
  }

  // ── Strategy 3: Open Graph meta fallback (only title, no tracks) ──────────
  throw new Error(
    "Could not extract track listing from Spotify page. " +
    "The playlist may be private, or Spotify's page structure has changed. " +
    "Try a CSV export from Spotify as an alternative."
  );
}

/**
 * Searches Deezer for a track and returns enriched metadata including release year.
 */
async function searchDeezer(trackName: string, artist: string): Promise<DeezerResult | null> {
  try {
    const q = encodeURIComponent(`track:"${trackName}" artist:"${artist}"`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const track = data?.data?.[0];
    if (!track) return null;

    // Fetch full track data to get release_date (search results don't include it)
    let releaseYear: number | null = null;
    try {
      const trackRes = await fetch(`https://api.deezer.com/track/${track.id}`, { cache: "no-store" });
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        if (trackData?.release_date) {
          releaseYear = new Date(trackData.release_date).getFullYear();
        }
      }
    } catch {}

    return {
      deezerId: track.id,
      trackName: track.title,
      artist: track.artist?.name ?? artist,
      album: track.album?.title ?? "",
      coverUrl: track.album?.cover_xl ?? track.album?.cover_big ?? "",
      previewUrl: track.preview,
      releaseYear,
    };
  } catch {
    return null;
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { spotifyUrl } = await req.json();
    if (!spotifyUrl) {
      return NextResponse.json({ error: "Missing spotifyUrl" }, { status: 400 });
    }

    // Step 1: Scrape playlist metadata from Spotify
    const { playlistName, tracks } = await scrapeSpotifyPlaylist(spotifyUrl);

    if (tracks.length === 0) {
      return NextResponse.json({ error: "No tracks found in playlist." }, { status: 404 });
    }

    // Step 2: Enrich each track via Deezer
    const results: BridgeTrack[] = [];
    const skipped: string[] = [];

    for (const { trackName, artist } of tracks) {
      const deezer = await searchDeezer(trackName, artist);
      if (!deezer || !deezer.releaseYear) {
        skipped.push(`${trackName} – ${artist}`);
        continue;
      }
      results.push({
        trackName: deezer.trackName,
        artist: deezer.artist,
        album: deezer.album,
        coverUrl: deezer.coverUrl,
        previewUrl: deezer.previewUrl,
        releaseYear: deezer.releaseYear,
        deezerId: deezer.deezerId,
      });
    }

    return NextResponse.json({
      playlistName,
      tracks: results,
      skipped,
      total: tracks.length,
      matched: results.length,
    });
  } catch (err: any) {
    console.error("[SpotifyBridge] Error:", err.message);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
