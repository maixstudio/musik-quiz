import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ step: "key_check", error: "GOOGLE_AI_API_KEY is NOT set on this server" });
  }

  const keyPreview = apiKey.slice(0, 6) + "..." + apiKey.slice(-4);

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Say hello in one word.");
    const text = result.response.text();
    return NextResponse.json({ ok: true, keyPreview, response: text });
  } catch (err) {
    return NextResponse.json({
      step: "gemini_call",
      keyPreview,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
