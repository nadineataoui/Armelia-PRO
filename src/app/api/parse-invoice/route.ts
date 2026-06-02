import { NextResponse } from "next/server";

const PROMPT = `Tu es un assistant comptable expert. Analyse cette facture.
Réponds UNIQUEMENT en JSON valide :
{
  "date": "JJ/MM/AAAA ou null",
  "fournisseur": "NOM SOCIETE EMETTRICE MAJUSCULES ou null",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE] ou null"
}
Règles: fournisseur = celui qui envoie (PAS Paragon Sport SA ni McBoard). Cherche: MONS ROYALE, SIDESHORE, FSSC, LOCALSEARCH. Ignore tampons et écriture manuscrite. Montant = total final imprimé surligné ou en gras.`;

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

async function geminiCall(parts: object[], apiKey: string): Promise<string> {
  const attempts = [
    // Format AQ. → Bearer token
    { url: BASE_URL, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
    // Format AQ. → x-goog-api-key
    { url: BASE_URL, headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey } },
    // Format AIzaSy → ?key= param
    { url: `${BASE_URL}?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
    // gemini-2.0-flash avec Bearer
    { url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
  ];
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 300, temperature: 0 } });
  
  for (const ep of attempts) {
    try {
      const res = await fetch(ep.url, { method: "POST", headers: ep.headers as unknown as Record<string, string>, body });
      const txt = await res.text();
      console.log(`[gemini] ${res.status} auth=${Object.keys(ep.headers).join(",")}`);
      if (res.ok) {
        const data = JSON.parse(txt) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (result) return result;
      } else {
        console.error(`[gemini] error body: ${txt.slice(0, 150)}`);
      }
    } catch (e) { console.error(`[gemini] fetch error:`, e); }
  }
  throw new Error("Gemini: tous les modes auth ont échoué");
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
  console.log(`[gemini] key prefix: ${apiKey.slice(0, 6)}`);
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
    console.error("[gemini] Final:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
