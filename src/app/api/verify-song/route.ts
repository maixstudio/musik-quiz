import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface VerifySongRequest {
  title: string;
  artist: string;
}

export interface VerifySongResponse {
  isValid: boolean;
  correctedTitle?: string;
  correctedArtist?: string;
  release_year?: number;
  note?: string;
}

export async function POST(req: NextRequest) {
  const body: VerifySongRequest = await req.json();
  const { title, artist } = body;

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not set" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a music expert. A user has entered a song title and artist name, possibly with typos or misspellings.

User input:
- Title: "${title}"
- Artist: "${artist}"

Determine if this is a real, identifiable song. Be tolerant of typos, alternate spellings, and minor mistakes.

Respond ONLY with a JSON object, no markdown, no explanation:
{
  "isValid": true_or_false,
  "correctedTitle": "correct title if found, else null",
  "correctedArtist": "correct artist name if found, else null",
  "release_year": original_release_year_as_number_or_null,
  "note": "optional short note"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    console.log("[verify-song] Gemini response:", text);

    const jsonText = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed: VerifySongResponse = JSON.parse(jsonText);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[verify-song] Error:", err);
    return NextResponse.json(
      { error: "AI verification failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
