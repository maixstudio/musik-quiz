import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const CATEGORIES = [
  "Pop",
  "Rock",
  "Hip-Hop / Rap",
  "Electronic / Dance",
  "Ballade",
  "R&B / Soul",
  "Metal",
  "Country / Folk",
  "Jazz / Blues",
  "One Hit Wonder",
] as const;

export interface EnrichSongRequest {
  track_name: string;
  artist: string;
  release_year: number;
}

export interface EnrichSongResponse {
  track_name: string;
  artist: string;
  release_year: number;
  categories: string;
  found: boolean;
  note?: string;
}

export async function POST(req: NextRequest) {
  const body: EnrichSongRequest = await req.json();
  const { track_name, artist, release_year } = body;

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not set" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a music data expert. Clean and verify the following song data.

Song data:
- Title: "${track_name}"
- Artist: "${artist}"
- Year: ${release_year}

Tasks:
1. Clean the title: remove suffixes like "Remastered", "Remaster", "Live", "Radio Edit", "Single Version", "Album Version", "Special Edition", "Deluxe Edition", "feat. ...", year annotations in brackets, etc. Return the clean, original title.
2. Clean the artist: remove featuring artists (feat., ft., with, etc.), keep only the main artist name.
3. Verify the release year: is ${release_year} the ORIGINAL release year of this song (not a remaster or re-release year)? If not, correct it.
4. Assign 1–3 categories from this exact list: ${CATEGORIES.join(", ")}. Multiple categories separated by comma. "One Hit Wonder" can be combined with another category.

If you cannot find this song in your knowledge, still clean the data as best as possible and set found to false.

Respond ONLY with a JSON object, no markdown, no explanation:
{
  "track_name": "cleaned title",
  "artist": "cleaned artist",
  "release_year": corrected_year_as_number,
  "categories": "Category1, Category2",
  "found": true_or_false,
  "note": "optional note if something was corrected or unclear"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    console.log("[enrich-song] Gemini response:", text);

    // Strip possible markdown code fences
    const jsonText = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed: EnrichSongResponse = JSON.parse(jsonText);

    console.log("[enrich-song] Parsed response:", parsed);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[enrich-song] Error:", err);
    return NextResponse.json(
      { error: "AI enrichment failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
