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

function extractPlaylistId(url: string): string | null {
  const webMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (webMatch) return webMatch[1];
  const uriMatch = url.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
}

/**
 * Scrapes Spotify's open playlist page and extracts tracks from __NEXT_DATA__.
 */
async function scrapeSpotifyPlaylist(playlistUrl: string): Promise<{
  playlistName: string;
  tracks: ScrapedTrack[];
}> {
  const id = extractPlaylistId(playlistUrl);
  if (!id) throw new Error("Could not parse Spotify playlist ID from URL.");

  const url = `https://open.spotify.com/playlist/${id}`;
  console.log(`[SpotifyBridge] Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Spotify returned HTTP ${res.status} for ${url}`);
  const html = await res.text();

  // Strategy 1: __NEXT_DATA__
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
          const trackData = item?.track ?? item?.itemV2?.data ?? item;
          const name: string | undefined = trackData?.name ?? trackData?.trackUnion?.name;
          const artistsRaw: any[] =
            trackData?.artists?.items ??
            trackData?.trackUnion?.firstArtist?.items ??
            trackData?.artists ??
            [];
          const artistName: string | undefined =
            artistsRaw[0]?.profile?.name ?? artistsRaw[0]?.name;

          if (name && artistName) tracks.push({ trackName: name, artist: artistName });
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

  // Strategy 2: JSON-LD
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const match of jsonLdMatches) {
    try {
      const ld = JSON.parse(match[1]);
      if (ld?.["@type"] === "MusicPlaylist" || ld?.numTracks) {
        const playlistName: string = ld.name ?? "Imported Playlist";
        const tracks: ScrapedTrack[] = (ld.track ?? [])
          .map((t: any) => ({ trackName: t.name, artist: t.byArtist?.name ?? "" }))
          .filter((t: ScrapedTrack) => t.trackName && t.artist);
        if (tracks.length > 0) return { playlistName, tracks };
      }
    } catch {}
  }

  throw new Error(
    "Could not extract track listing from Spotify page. " +
    "The playlist may be private, or Spotify's page structure has changed."
  );
}

// ── Deezer ────────────────────────────────────────────────────────────────────
async function searchDeezer(trackName: string, artist: string): Promise<DeezerResult | null> {
  try {
    const q = encodeURIComponent(`track:"${trackName}" artist:"${artist}"`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const track = data?.data?.[0];
    if (!track) return null;

    let releaseYear: number | null = null;
    try {
      const trackRes = await fetch(`https://api.deezer.com/track/${track.id}`, { cache: "no-store" });
      if (trackRes.ok) {
        const td = await trackRes.json();
        if (td?.release_date) releaseYear = new Date(td.release_date).getFullYear();
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

// ── MusicBrainz (free, no account) ───────────────────────────────────────────
// Returns the earliest release year found for the recording.
async function getYearFromMusicBrainz(trackName: string, artist: string): Promise<number | null> {
  try {
    const q = encodeURIComponent(`recording:"${trackName}" AND artist:"${artist}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${q}&limit=10&fmt=json`,
      {
        headers: { "User-Agent": "NeonArchivist/1.0 (trebor.sekim@gmail.com)" },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const recordings: any[] = data?.recordings ?? [];

    let earliest: number | null = null;
    for (const rec of recordings) {
      // Each recording can have multiple releases
      const releases: any[] = rec?.releases ?? [];
      for (const rel of releases) {
        const dateStr: string | undefined = rel?.date;
        if (!dateStr) continue;
        const year = parseInt(dateStr.slice(0, 4), 10);
        if (!isNaN(year) && year > 1900 && year <= new Date().getFullYear()) {
          if (earliest === null || year < earliest) earliest = year;
        }
      }
      // Also check first-release-date on the recording itself
      const recDate: string | undefined = rec?.["first-release-date"];
      if (recDate) {
        const year = parseInt(recDate.slice(0, 4), 10);
        if (!isNaN(year) && year > 1900 && (earliest === null || year < earliest)) earliest = year;
      }
    }
    return earliest;
  } catch {
    return null;
  }
}

// ── iTunes Search API (free, no account) ─────────────────────────────────────
async function getYearFromItunes(trackName: string, artist: string): Promise<number | null> {
  try {
    const term = encodeURIComponent(`${artist} ${trackName}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=10`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results: any[] = data?.results ?? [];

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetTrack = norm(trackName);
    const targetArtist = norm(artist);

    let earliest: number | null = null;
    for (const r of results) {
      // Only consider results that roughly match
      if (!norm(r.trackName ?? "").includes(targetTrack.slice(0, 6))) continue;
      if (!norm(r.artistName ?? "").includes(targetArtist.slice(0, 4))) continue;
      const dateStr: string | undefined = r.releaseDate;
      if (!dateStr) continue;
      const year = new Date(dateStr).getFullYear();
      if (!isNaN(year) && year > 1900 && (earliest === null || year < earliest)) earliest = year;
    }
    return earliest;
  } catch {
    return null;
  }
}

// ── Best year resolution ──────────────────────────────────────────────────────
/**
 * Queries Deezer, MusicBrainz and iTunes and returns the oldest reliable year.
 * This combats Deezer's tendency to return re-release years instead of original.
 */
async function resolveRelaseYear(
  trackName: string,
  artist: string,
  deezerYear: number | null
): Promise<number | null> {
  // Run iTunes & MusicBrainz in parallel (Deezer year is already known)
  const [mbYear, itunesYear] = await Promise.all([
    getYearFromMusicBrainz(trackName, artist),
    getYearFromItunes(trackName, artist),
  ]);

  console.log(`[DateResolver] "${trackName}" — Deezer:${deezerYear} MB:${mbYear} iTunes:${itunesYear}`);

  const candidates = [deezerYear, mbYear, itunesYear].filter(
    (y): y is number => y !== null && y > 1900 && y <= new Date().getFullYear()
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { spotifyUrl } = await req.json();
    if (!spotifyUrl)
      return NextResponse.json({ error: "Missing spotifyUrl" }, { status: 400 });

    const { playlistName, tracks } = await scrapeSpotifyPlaylist(spotifyUrl);

    if (tracks.length === 0)
      return NextResponse.json({ error: "No tracks found in playlist." }, { status: 404 });

    const results: BridgeTrack[] = [];
    const skipped: string[] = [];

    for (const { trackName, artist } of tracks) {
      const deezer = await searchDeezer(trackName, artist);
      if (!deezer) {
        skipped.push(`${trackName} – ${artist} (kein Deezer-Treffer)`);
        continue;
      }

      // Cross-reference with MusicBrainz + iTunes to get the oldest release year
      const bestYear = await resolveRelaseYear(trackName, artist, deezer.releaseYear);

      if (!bestYear) {
        skipped.push(`${trackName} – ${artist} (kein Erscheinungsjahr ermittelt)`);
        continue;
      }

      results.push({
        trackName: deezer.trackName,
        artist: deezer.artist,
        album: deezer.album,
        coverUrl: deezer.coverUrl,
        previewUrl: deezer.previewUrl,
        releaseYear: bestYear,
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
