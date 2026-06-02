import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt optimisé pour les factures suisses réelles (MONS ROYALE, SIDESHORE,
// FSSC/Faction, LOCALSEARCH, etc.) scannées par téléphone ou importées.
// ─────────────────────────────────────────────────────────────────────────────
const PROMPT = `Tu es un expert comptable spécialisé dans les factures suisses.

Analyse cette facture et retourne UNIQUEMENT ce JSON valide (null si introuvable) :
{
  "date": "JJ/MM/AAAA",
  "fournisseur": "NOM EN MAJUSCULES",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE]"
}

═══ RÈGLES ABSOLUES ═══

1. DATE — Date d'émission imprimée UNIQUEMENT :
   - Cherche : "Date de facturation", "Invoice Date", "Date:", "Facturé le", "Dated"
   - Accepte tous les formats : 24/9/2024 → 24/09/2024 | 15.10.2024 → 15/10/2024 | "01 novembre 2024" → 01/11/2024 | "11 Sep 2024" → 11/09/2024
   - IGNORE absolument les textes manuscrits/stylo (ex: "Hiver 24/25", "Wink 24/25" = saisons, PAS des dates)
   - JAMAIS la Date d'échéance / Due Date / Date de livraison

2. FOURNISSEUR — Société émettrice (logo/en-tête) :
   - Fournisseurs connus : MONS ROYALE, SIDESHORE, FSSC, LOCALSEARCH, FACTION
   - Paragon Sport SA, McBoard = CLIENT destinataire → IGNORER
   - Prendre le nom de la marque principale visible en haut/logo

3. MONTANT — RÈGLE CRITIQUE : toujours le DERNIER total après toutes taxes et remises :
   PRIORITÉ (dans l'ordre) :
   a) Montant surligné en jaune ou dans une boîte noire/encadrée en bas de facture
   b) "Total arrondi" / "Total arrondi en CHF" → c'est le montant final à payer
   c) "Total facture" (ligne en gras/encadrée, souvent fond noir)
   d) "Total CHF" / "Total TTC" / "Grand Total"
   e) Dernier montant en bas de la colonne des totaux

   IGNORER ABSOLUMENT :
   - Sous-total / Résultat intermédiaire / Total intermédiaire (avant taxes)
   - Montant TVA / MwSt / Taxe seul
   - Remise / Discount / Rabais
   - Montants par ligne d'article
   - Montants manuscrits/stylo ajoutés sur la facture
   - Numéros de contrat, client, facture

   VÉRIFICATION OBLIGATOIRE DU MONTANT :
   Le bon montant = Sous-total/Résultat intermédiaire + TVA/MwSt/Taxe.
   Vérifie toujours : si montant_détecté ≈ sous-total (sans TVA), c'est FAUX → ajouter la TVA.

   SIDESHORE spécifiquement : la facture a toujours cette structure :
     - "Résultat intermédiaire" ou "Total livraison" = SOUS-TOTAL (sans TVA) → IGNORER
     - "MwSt 8.1%" = TVA → IGNORER
     - "Total facture" dans boîte noire = MONTANT CORRECT ✓
   Exemple : Intermédiaire 1085.50 + MwSt 87.95 → Total facture 1173.45 ✓ (PAS 1085.50)

   LOCALSEARCH spécifiquement :
     - "Total intermédiaire" = SOUS-TOTAL → IGNORER
     - "+ TVA (8,1%)" = TVA → IGNORER
     - "Total arrondi en CHF" surligné jaune = MONTANT CORRECT ✓
   Exemple : 378.00 + 30.62 = 408.62 → Arrondi -0.02 → Total arrondi 408.60 ✓ (PAS 378)

   MONS ROYALE spécifiquement :
     - "Sous-total" = SOUS-TOTAL → IGNORER
     - "Discount" / "Remise" = à déduire
     - "Taxe" = TVA → fait partie du total
     - "Total CHF" surligné jaune = MONTANT CORRECT ✓

   Si lecture ambiguë d'un chiffre (ex: 4 vs 2), utilise le calcul pour corriger.

   Format suisse : 4'650.05 ou SFr. 4,650.05 ou CHF 4 650.05 → retourner 4650.05
   Plage valide : entre 1.00 et 99999.99

4. LIBELLE : "FACTURE [FOURNISSEUR] - [DATE]"

Réponds UNIQUEMENT avec le JSON, sans texte autour.`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseJSON(raw: string) {
  // Cherche le premier bloc JSON dans la réponse
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as {
      date?: string | null;
      fournisseur?: string | null;
      montant?: number | null;
      libelle?: string | null;
    };
  } catch {
    return null;
  }
}

function buildResponse(parsed: {
  date?: string | null;
  fournisseur?: string | null;
  montant?: number | null;
  libelle?: string | null;
}) {
  return NextResponse.json({
    date: parsed.date ?? null,
    fournisseur: parsed.fournisseur ?? null,
    montant: typeof parsed.montant === "number" ? parsed.montant : null,
    libelle: parsed.libelle ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini 2.0 Flash — Vision (image base64)
// ─────────────────────────────────────────────────────────────────────────────
async function callGeminiVision(imageBase64: string, mediaType: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType || "image/jpeg", data: imageBase64 } },
          { text: PROMPT },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 300 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[gemini-vision] error:", res.status, err.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  console.log("[gemini-vision] OK:", raw.slice(0, 100));
  return parseJSON(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini 2.0 Flash — Texte (OCR)
// ─────────────────────────────────────────────────────────────────────────────
async function callGeminiText(ocrText: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${PROMPT}\n\nTexte OCR de la facture :\n"""\n${ocrText.slice(0, 4000)}\n"""` }],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 300 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[gemini-text] error:", res.status, err.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  console.log("[gemini-text] OK:", raw.slice(0, 100));
  return parseJSON(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq — Texte fallback (llama-3.3-70b)
// ─────────────────────────────────────────────────────────────────────────────
async function callGroqText(ocrText: string, apiKey: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `Texte OCR de la facture :\n"""\n${ocrText.slice(0, 3000)}\n"""` },
      ],
      max_tokens: 256,
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[groq-text] error:", res.status, err.slice(0, 200));
    return null;
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  console.log("[groq-text] OK:", raw.slice(0, 100));
  return parseJSON(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Route principale — cascade : Gemini Vision → Gemini Text → Groq Text
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      ocrText?: string;
      imageBase64?: string;
      mediaType?: string;
    };

    const geminiKey = process.env.GOOGLE_AI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json({ error: "Aucune clé API configurée" }, { status: 500 });
    }

    // ── 1. Gemini Vision : image envoyée directement (meilleure précision) ────
    if (body.imageBase64 && geminiKey) {
      const parsed = await callGeminiVision(body.imageBase64, body.mediaType ?? "image/jpeg", geminiKey);
      if (parsed) return buildResponse(parsed);
    }

    // ── 2. Gemini Texte : OCR déjà extrait ───────────────────────────────────
    const text = body.ocrText?.trim();
    if (text && text.length > 20 && geminiKey) {
      const parsed = await callGeminiText(text, geminiKey);
      if (parsed) return buildResponse(parsed);
    }

    // ── 3. Groq Texte : fallback si Gemini indisponible ──────────────────────
    if (text && text.length > 20 && groqKey) {
      const parsed = await callGroqText(text, groqKey);
      if (parsed) return buildResponse(parsed);
    }

    return NextResponse.json({ error: "Extraction impossible" }, { status: 500 });
  } catch (err) {
    console.error("[parse-invoice]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
