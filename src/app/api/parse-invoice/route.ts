import { NextResponse } from "next/server";

// Augmente le timeout Vercel à 60s (nécessite plan Pro - sinon 10s par défaut)
export const maxDuration = 60;

const PROMPT = `Tu es un assistant comptable expert en factures suisses et européennes.
Analyse cette facture et réponds UNIQUEMENT en JSON valide, sans texte avant ni après.

JSON attendu (null si non trouvé) :
{
  "date": "JJ/MM/AAAA",
  "fournisseur": "NOM SOCIÉTÉ ÉMETTRICE EN MAJUSCULES",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE]"
}

RÈGLES :
1. DATE : date d'émission (pas l'échéance). Format JJ/MM/AAAA.
2. FOURNISSEUR : société qui ENVOIE la facture. "Paragon Sport SA" et "McBoard" sont TOUJOURS le client — ignorer. Chercher le logo/marque : MONS ROYALE, SIDESHORE, FSSC, LOCALSEARCH. Ignorer tampons et manuscrits.
3. MONTANT : total final imprimé (surligné ou en gras). Ignorer manuscrits. Nombre décimal.
4. LIBELLÉ : "FACTURE [FOURNISSEUR] - [DATE]" majuscules.`;

const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];

async function tryModel(model: string, parts: object[], apiKey: string): Promise<string | null> {
  // Les clés AQ. de Google AI Studio utilisent x-goog-api-key
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  };
  const body = { contents: [{ parts }], generationConfig: { maxOutputTokens: 256, temperature: 0 } };
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[gemini] ${model} ${res.status}:`, err.slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (text) console.log(`[gemini] OK: ${model}`);
    return text || null;
  } catch (e) {
    console.error(`[gemini] ${model} error:`, e);
    return null;
  }
}

function parseResponse(raw: string) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null }; }
  catch { return null; }
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error("[gemini] GOOGLE_AI_API_KEY manquante");
    return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
  }
  console.log(`[gemini] key prefix: ${apiKey.slice(0, 6)}`);

  try {
    const body = (await req.json()) as { ocrText?: string; imageBase64?: string; mediaType?: string };
    
    let parts: object[];
    if (body.imageBase64) {
      parts = [
        { inlineData: { mimeType: body.mediaType || "image/jpeg", data: body.imageBase64 } },
        { text: PROMPT },
      ];
    } else if (body.ocrText && body.ocrText.trim().length > 10) {
      parts = [{ text: `${PROMPT}\n\nTexte:\n"""\n${body.ocrText.slice(0, 4000)}\n"""` }];
    } else {
      return NextResponse.json({ error: "Données insuffisantes" }, { status: 400 });
    }

    let raw: string | null = null;
    for (const model of MODELS) {
      raw = await tryModel(model, parts, apiKey);
      if (raw) break;
    }

    if (!raw) return NextResponse.json({ error: "Gemini indisponible" }, { status: 500 });

    const parsed = parseResponse(raw);
    if (!parsed) return NextResponse.json({ error: "Réponse invalide" }, { status: 500 });

    return NextResponse.json({
      date: parsed.date ?? null,
      fournisseur: parsed.fournisseur ?? null,
      montant: typeof parsed.montant === "number" ? parsed.montant : null,
      libelle: parsed.libelle ?? null,
    });
  } catch (err) {
    console.error("[gemini] Erreur:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
