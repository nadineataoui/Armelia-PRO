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

1. DATE : Prendre la date D'ÉMISSION de la facture (pas la date d'échéance, pas la date de livraison).
   - Chercher les labels : "Date de facturation", "Invoice Date", "Date", "Facture du"
   - Format de sortie : JJ/MM/AAAA

2. FOURNISSEUR : C'est la société qui ENVOIE la facture (le vendeur).
   - Le client destinataire dans ces factures est TOUJOURS "Paragon Sport SA" ou "McBoard" — NE PAS prendre ces noms.
   - Chercher le NOM DE MARQUE/LOGO en haut du document : ex. "MONS ROYALE", "SIDESHORE", "fssc", "localsearch"
   - Ignorer complètement les tampons, les annotations manuscrites et les adresses postales.
   - Retourner en MAJUSCULES.

3. MONTANT : Prendre le TOTAL FINAL imprimé/typographié (souvent surligné en jaune ou en gras).
   - Chercher : "Total CHF", "Total facture", "Total arrondi", "TOTAL", "SFr.", montant surligné
   - IGNORER tous les chiffres écrits à la main (annotations manuscrites en haut ou sur les côtés)
   - Retourner un nombre décimal sans symbole monétaire (ex: 4650.05)

4. LIBELLÉ : "FACTURE [FOURNISSEUR] - [DATE]" en majuscules.`;

async function callGemini(imageBase64: string, mediaType: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY manquante");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ inlineData: { mimeType: mediaType, data: imageBase64 } }, { text: PROMPT }] }],
    generationConfig: { maxOutputTokens: 300, temperature: 0 },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGeminiText(text: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY manquante");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: `${PROMPT}\n\nTexte de la facture :\n"""\n${text.slice(0, 4000)}\n"""` }] }],
    generationConfig: { maxOutputTokens: 300, temperature: 0 },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
    console.error("[parse-invoice]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
