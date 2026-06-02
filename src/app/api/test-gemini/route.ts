import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Clé manquante", key: null });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Say hello in one word" }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });
    const text = await res.text();
    return NextResponse.json({ status: res.status, keyPrefix: apiKey.slice(0, 8), response: text.slice(0, 300) });
  } catch (e) {
    return NextResponse.json({ error: String(e), keyPrefix: apiKey.slice(0, 8) });
  }
}
