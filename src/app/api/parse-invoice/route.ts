import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `Tu es un assistant comptable expert. Analyse cette facture.
Réponds UNIQUEMENT en JSON valide :
{
  "date": "JJ/MM/AAAA ou null",
  "fournisseur": "NOM SOCIETE EMETTRICE MAJUSCULES ou null",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE] ou null"
}
Règles: fournisseur = celui qui envoie (PAS Paragon Sport SA ni McBoard). Cherche: MONS ROYALE, SIDESHORE, FSSC, LOCALSEARCH. Ignore tampons et écriture manuscrite. Montant = total final imprimé surligné ou en gras.`;

function parseResponse(raw: string) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null }; }
  catch { return null; }
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_AI_API_KEY manquante" }, { status: 500 });
  console.log(`[gemini] key: ${apiKey.slice(0, 6)}...`);

  try {
    const body = (await req.json()) as { ocrText?: string; imageBase64?: string; mediaType?: string };
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let result;
    if (body.imageBase64) {
      result = await model.generateContent([
        { inlineData: { mimeType: (body.mediaType || "image/jpeg") as "image/jpeg", data: body.imageBase64 } },
        PROMPT,
      ]);
    } else if (body.ocrText && body.ocrText.trim().length > 10) {
      result = await model.generateContent(`${PROMPT}\n\nTexte:\n"""\n${body.ocrText.slice(0, 4000)}\n"""`);
    } else {
      return NextResponse.json({ error: "Données insuffisantes" }, { status: 400 });
    }

    const raw = result.response.text();
    console.log(`[gemini] OK, response: ${raw.slice(0, 50)}`);
    const parsed = parseResponse(raw);
    if (!parsed) return NextResponse.json({ error: "Réponse invalide: " + raw.slice(0, 100) }, { status: 500 });
    return NextResponse.json({ date: parsed.date ?? null, fournisseur: parsed.fournisseur ?? null, montant: typeof parsed.montant === "number" ? parsed.montant : null, libelle: parsed.libelle ?? null });
  } catch (err) {
    console.error("[gemini] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
