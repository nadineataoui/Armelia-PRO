import { NextResponse } from "next/server";

const PROMPT = `Tu es un assistant comptable expert. Analyse cette facture.
Réponds UNIQUEMENT en JSON valide :
{
  "date": "JJ/MM/AAAA ou null",
  "fournisseur": "NOM SOCIETE EMETTRICE MAJUSCULES ou null",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE] ou null"
}
Règles: fournisseur = celui qui envoie (PAS Paragon Sport SA ni McBoard). Cherche: MONS ROYALE, SIDESHORE, FSSC, LOCALSEARCH. Ignore tampons et écriture manuscrite. Montant = total final imprimé.`;

async function geminiCall(parts: object[], apiKey: string): Promise<string> {
  // Essaie plusieurs variantes d'authentification
  const attempts = [
    { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
    { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
    { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`, headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey } },
    { url: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
  ];

  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 256, temperature: 0 } });

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { method: "POST", headers: attempt.headers as Record<string,string>, body });
      const text = await res.text();
      if (res.ok) {
        console.log(`[gemini] OK with: ${attempt.url.slice(0, 80)}`);
        const data = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      }
      console.error(`[gemini] ${res.status} for ${attempt.url.slice(50, 90)}: ${text.slice(0, 150)}`);
    } catch (e) {
      console.error(`[gemini] fetch error:`, e);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

function parseResponse(raw: string) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null }; }
  catch { return null; }
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_AI_API_KEY manquante" }, { status: 500 });
  console.log(`[gemini] key: ${apiKey.slice(0, 8)}...`);

  try {
    const body = (await req.json()) as { ocrText?: string; imageBase64?: string; mediaType?: string };
    let parts: object[];
    if (body.imageBase64) {
      parts = [{ inlineData: { mimeType: body.mediaType || "image/jpeg", data: body.imageBase64 } }, { text: PROMPT }];
    } else if (body.ocrText && body.ocrText.trim().length > 10) {
      parts = [{ text: `${PROMPT}\n\nTexte:\n"""\n${body.ocrText.slice(0, 4000)}\n"""` }];
    } else {
      return NextResponse.json({ error: "Données insuffisantes" }, { status: 400 });
    }

    const raw = await geminiCall(parts, apiKey);
    const parsed = parseResponse(raw);
    if (!parsed) return NextResponse.json({ error: "Réponse invalide: " + raw.slice(0, 100) }, { status: 500 });
    return NextResponse.json({ date: parsed.date ?? null, fournisseur: parsed.fournisseur ?? null, montant: typeof parsed.montant === "number" ? parsed.montant : null, libelle: parsed.libelle ?? null });
  } catch (err) {
    console.error("[gemini] Final error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
