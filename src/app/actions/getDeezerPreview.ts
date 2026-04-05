"use server";

/**
 * Fetches a fresh, non-expired Deezer preview URL for a given Deezer track ID.
 * Deezer CDN preview URLs have signed tokens (hdnea=exp=...) that expire quickly
 * when stored at import time. This action fetches a live URL on demand.
 */
export async function getFreshPreviewUrl(deezerId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.deezer.com/track/${deezerId}`, {
      // No caching — we always want the freshest signed URL
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[Deezer] Track ${deezerId} returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();

    if (data?.preview) {
      console.log(`[Deezer] Fresh URL for ${deezerId}: ${data.preview.slice(0, 60)}...`);
      return data.preview as string;
    }

    console.warn(`[Deezer] No preview in response for track ${deezerId}`, data);
    return null;
  } catch (err) {
    console.error(`[Deezer] Error fetching track ${deezerId}:`, err);
    return null;
  }
}
