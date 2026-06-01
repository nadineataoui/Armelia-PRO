import { NextResponse } from "next/server";

const PROMPT = `Tu es un assistant comptable expert en factures suisses et européennes.
Analyse cette facture et réponds UNIQUEMENT en JSON valide, sans texte avant ni après.

JSON attendu (null si non trouvé) :
{
  "date": "JJ/MM/AAAA",
  "fournisseur": "NOM SOCIÉTÉ ÉMETTRICE EN MAJUSCULES",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE]"
}

RÈGLES STRICTES :
1. DATE : date d'émission (pas l'échéance). Labels : "Date de facturation", "Invoice Date". Format JJ/MM/AAAA.
2. FOURNISSEUR : société qui ENVOIE la facture. "Paragon Sport SA" et "McBoard" sont TOUJOURS le client — ne pas les prendre. Chercher le logo/marque en haut : MONS ROYALE, SIDESHORE, fssc, localsearch. Ignorer tampons et manuscrits.
3. MONTANT : total final imprimé (surligné ou en gras). Ignorer chiffres manuscrits. Nombre décimal sans symbole.
4. LIBELLÉ : "FACTURE [FOURNISSEUR] - [DATE]" en majuscules.`;

const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
];

async function callGeminiWithModel(model: string, parts: object[]): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY manquante");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts }],
    generationConfig: { maxOutputTokens: 300, temperature: 0 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${model} ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGemini(imageBase64: string, mediaType: string): Promise<string> {
  const parts = [
    { inlineData: { mimeType: mediaType, data: imageBase64 } },
    { text: PROMPT },
  ];
  for (const model of MODELS) {
    try {
      const result = await callGeminiWithModel(model, parts);
      console.log(`[parse-invoice] Gemini OK with model: ${model}`);
      return result;
    } catch (e) {
      console.error(`[parse-invoice] Model ${model} failed:`, e);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

async function callGeminiText(text: string): Promise<string> {
  const parts = [{ text: `${PROMPT}\n\nTexte de la facture :\n"""\n${text.slice(0, 4000)}\n"""` }];
  for (const model of MODELS) {
    try {
      return await callGeminiWithModel(model, parts);
    } catch (e) {
      console.error(`[parse-invoice] Text model ${model} failed:`, e);
    }
  }
  throw new Error("Tous les modèles Gemini ont échoué");
}

function parseResponse(raw: string) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null };
  } catch { return null; }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { ocrText?: string; imageBase64?: string; mediaType?: string };

    if (!process.env.GOOGLE_AI_API_KEY) {
      console.error("[parse-invoice] GOOGLE_AI_API_KEY manquante !");
      return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
    }

    let raw = "";
    if (body.imageBase64) {
      raw = await callGemini(body.imageBase64, body.mediaType || "image/jpeg");
    } else if (body.ocrText && body.ocrText.trim().length > 10) {
      raw = await callGeminiText(body.ocrText);
    } else {
      return NextResponse.json({ error: "Données insuffisantes" }, { status: 400 });
    }

    const parsed = parseResponse(raw);
    if (!parsed) return NextResponse.json({ error: "Réponse invalide" }, { status: 500 });

    return NextResponse.json({
      date: parsed.date ?? null,
      fournisseur: parsed.fournisseur ?? null,
      montant: typeof parsed.montant === "number" ? parsed.montant : null,
      libelle: parsed.libelle ?? null,
    });
  } catch (err) {
    console.error("[parse-invoice] Erreur finale:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
