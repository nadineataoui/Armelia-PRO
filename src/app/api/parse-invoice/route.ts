import { NextResponse } from "next/server";

const PROMPT = `Tu es un assistant comptable expert en factures suisses. Voici du texte extrait par OCR (parfois imparfait) d'une facture.

Identifie et retourne UNIQUEMENT ce JSON valide (null si introuvable) :
{
  "date": "JJ/MM/AAAA",
  "fournisseur": "NOM SOCIETE EN MAJUSCULES",
  "montant": 123.45,
  "libelle": "FACTURE [FOURNISSEUR] - [DATE]"
}

Règles importantes :
- fournisseur : cherche le NOM DE MARQUE dans tout le texte. Les fournisseurs possibles sont : MONS ROYALE, SIDESHORE, FSSC (ou Faction Collective ou fullstacksupply), LOCALSEARCH. Ignore "Paragon Sport SA" et "McBoard" qui sont toujours le CLIENT.
- date : date d'émission de la facture au format JJ/MM/AAAA (pas la date d'échéance)
- montant : le TOTAL FINAL payé (Total facture, Total CHF, Total arrondi). Nombre décimal, pas de symbole monétaire.
- Le texte OCR peut avoir des erreurs de lecture, interprète intelligemment.`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { ocrText?: string; imageBase64?: string };
    const text = body.ocrText?.trim();
    if (!text || text.length < 10) {
      return NextResponse.json({ error: "Texte trop court" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GOOGLE_AI_API_KEY;

    // Essayer Groq d'abord (rapide et fiable)
    if (groqKey) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: PROMPT },
              { role: "user", content: `Texte OCR de la facture:\n"""\n${text.slice(0, 3000)}\n"""` }
            ],
            max_tokens: 256,
            temperature: 0,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const raw = data.choices?.[0]?.message?.content ?? "";
          console.log("[groq] OK:", raw.slice(0, 60));
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null };
            return NextResponse.json({ date: parsed.date ?? null, fournisseur: parsed.fournisseur ?? null, montant: typeof parsed.montant === "number" ? parsed.montant : null, libelle: parsed.libelle ?? null });
          }
        } else {
          const err = await res.text();
          console.error("[groq] error:", res.status, err.slice(0, 100));
        }
      } catch (e) { console.error("[groq] fetch error:", e); }
    }

    // Fallback Gemini
    if (geminiKey) {
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`${PROMPT}\n\nTexte:\n"""\n${text.slice(0, 3000)}\n"""`);
        const raw = result.response.text();
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null };
          return NextResponse.json({ date: parsed.date ?? null, fournisseur: parsed.fournisseur ?? null, montant: typeof parsed.montant === "number" ? parsed.montant : null, libelle: parsed.libelle ?? null });
        }
      } catch (e) { console.error("[gemini] error:", e); }
    }

    return NextResponse.json({ error: "IA indisponible" }, { status: 500 });
  } catch (err) {
    console.error("[parse-invoice]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
