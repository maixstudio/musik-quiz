import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface VerifySongRequest {
  titleInput: string;
  artistInput: string;
  correctTitle: string;
  correctArtist: string;
}

export interface VerifySongResponse {
  titleCorrect: boolean;
  artistCorrect: boolean;
}

export async function POST(req: NextRequest) {
  const body: VerifySongRequest = await req.json();
  const { titleInput, artistInput, correctTitle, correctArtist } = body;

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY not set" }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are judging a music quiz. A player tried to guess the song title and artist.

Correct title: "${correctTitle}"
Correct artist: "${correctArtist}"

Player's title input: "${titleInput || ""}"
Player's artist input: "${artistInput || ""}"

Rules:
- Be tolerant of typos, phonetic misspellings, and minor errors (e.g. "charma chamelia" → "Karma Chameleon" = correct, "smels like teen sprit" → "Smells Like Teen Spirit" = correct)
- If the input is clearly a different song or artist, mark as wrong
- Empty input is always wrong
- Partial artist names are acceptable if unambiguous (e.g. "Bowie" → "David Bowie" = correct)

Respond ONLY with JSON, no explanation:
{"titleCorrect": true_or_false, "artistCorrect": true_or_false}`;

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
