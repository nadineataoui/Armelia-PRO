export type ParsedInvoice = {
  date: string | null;
  fournisseur: string | null;
  montant: number | null;
  libelle: string | null;
};

/**
 * Normalise le texte OCR brut pour rendre les regex plus fiables.
 * - normalisation Unicode (NFKC)
 * - espaces insécables → espace simple
 * - fins de ligne uniformisées
 * - espaces multiples réduits
 */
type DateCandidate = {
  date: Date;
  formatted: string;
  index: number;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const isValidDateParts = (yyyy: number, mm: number, dd: number) => {
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return false;
  if (yyyy < 2000 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return d.getUTCFullYear() === yyyy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
};

const startOfTodayUtc = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const normalizeText = (text: string) => {
  return (text || '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const splitLines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const parseAmountString = (raw: string) => {
  // Supprime les préfixes/suffixes monétaires (€, $, CHF, SFr., Fr., etc.)
  let s = (raw || '').replace(/[\s\u00a0\u202f]/g, '').replace(/[€$]/g, '');
  // Préfixe/suffixe SFr. CHF Fr.
  s = s.replace(/^(SFr\.?|CHF|Fr\.)/, '').replace(/(SFr\.?|CHF|Fr\.)$/, '');
  // Apostrophe suisse comme séparateur de milliers : 4\'650.05
  s = s.replace(/'/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      return Number.parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    return Number.parseFloat(s.replace(/,/g, ''));
  }
  if (lastComma !== -1) return Number.parseFloat(s.replace(',', '.'));
  return Number.parseFloat(s);
};

const formatDdMmYyyy = (d: Date) => {
  const dd = pad2(d.getUTCDate());
  const mm = pad2(d.getUTCMonth() + 1);
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Mois en toutes lettres (français + anglais)
const MONTH_MAP: Record<string, number> = {
  janvier: 1, jan: 1, january: 1,
  février: 2, fevrier: 2, fév: 2, fev: 2, february: 2, feb: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, jul: 7, july: 7,
  août: 8, aout: 8, aoû: 8, aug: 8, august: 8,
  septembre: 9, sep: 9, sept: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  décembre: 12, decembre: 12, déc: 12, dec: 12, december: 12,
};

export const extractDate = (lines: string[], now = new Date()): string | null => {
  // Règle: prendre la première date cohérente, ignorer les dates futures.
  const today = startOfTodayUtc(now).getTime();

  const patterns: Array<(s: string) => { yyyy: number; mm: number; dd: number } | null> = [
    // dd/mm/yyyy ou dd-mm-yyyy
    (s) => {
      const m = s.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
      if (!m) return null;
      return { dd: Number(m[1]), mm: Number(m[2]), yyyy: Number(m[3]) };
    },
    // dd.mm.yyyy (format suisse/européen avec points)
    (s) => {
      const m = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
      if (!m) return null;
      return { dd: Number(m[1]), mm: Number(m[2]), yyyy: Number(m[3]) };
    },
    // yyyy-mm-dd (ISO)
    (s) => {
      const m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
      if (!m) return null;
      return { yyyy: Number(m[1]), mm: Number(m[2]), dd: Number(m[3]) };
    },
    // dd mois yyyy — ex: "01 novembre 2024", "11 Sep 2024"
    (s) => {
      const m = s.match(/\b(\d{1,2})\s+([a-zA-Zà-ÿ]{3,})\.?\s+(\d{4})\b/);
      if (!m) return null;
      const monthKey = m[2].toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents pour lookup
        .replace(/[^a-z]/g, '');
      // Cherche aussi avec accents
      const mm = MONTH_MAP[m[2].toLowerCase()] ?? MONTH_MAP[monthKey];
      if (!mm) return null;
      return { dd: Number(m[1]), mm, yyyy: Number(m[3]) };
    },
    // mois dd, yyyy — ex: "September 11, 2024"
    (s) => {
      const m = s.match(/\b([a-zA-Zà-ÿ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
      if (!m) return null;
      const monthKey = m[1].toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
      const mm = MONTH_MAP[m[1].toLowerCase()] ?? MONTH_MAP[monthKey];
      if (!mm) return null;
      return { dd: Number(m[2]), mm, yyyy: Number(m[3]) };
    },
  ];

  const candidates: DateCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const parse of patterns) {
      const parts = parse(line);
      if (!parts) continue;
      const { yyyy, mm, dd } = parts;
      if (!isValidDateParts(yyyy, mm, dd)) continue;
      const d = new Date(Date.UTC(yyyy, mm - 1, dd));
      if (d.getTime() > today) continue;
      candidates.push({ date: d, formatted: formatDdMmYyyy(d), index: i });
      break;
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0].formatted;
};

export const extractAmount = (lines: string[]): number | null => {
  // Règle: priorité aux lignes TTC / Total TTC / Total / Total facture / Total CHF, ignorer TVA/HT.
  // Supporte aussi les formats suisses : SFr. 4,650.05 / CHF 84.70 / 4'650.05
  const amountRegex = /(?:SFr\.?\s*|CHF\s*|Fr\.?\s*)?(\d{1,3}(?:[\s\'\u00a0\u202f,.]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?:\s*(?:SFr\.?|CHF|Fr\.?))?/gi;

  const scoreLine = (line: string) => {
    const l = line.toLowerCase();
    const hasTtc = /\bttc\b/.test(l) || /total\s*ttc/.test(l);
    const hasTotal = /\btotal\b/.test(l);
    const hasTotalFact = /total\s*(facture|chf|arrondi|invoice)/.test(l);
    const hasVatOrHt = /\btva\b/.test(l) || /\bht\b/.test(l) || /\bmwst\b/.test(l) || /\bvat\b/.test(l);
    if (hasVatOrHt && !hasTtc) return -10;
    return (hasTtc ? 10 : 0) + (hasTotalFact ? 8 : 0) + (hasTotal ? 3 : 0);
  };

  const candidates: Array<{ value: number; score: number; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const score = scoreLine(line);
    if (score < 0) continue;
    const matches = Array.from(line.matchAll(amountRegex));
    if (matches.length === 0) continue;
    const raw = matches[matches.length - 1]?.[1] || '';
    const value = parseAmountString(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    candidates.push({ value, score, index: i });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score || b.value - a.value || a.index - b.index);
    return candidates[0].value;
  }

  const allMatches = lines.flatMap((l) => Array.from(l.matchAll(amountRegex)).map((m) => m[1]));
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const value = parseAmountString(allMatches[i] || '');
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
};

const cleanSupplierLine = (line: string) => {
  let s = (line || '').trim();
  // Supprime SIRET, RCS, TVA, N°, numéros longs
  s = s.replace(/\b(siret|rcs|tva|vat|n°|no\.?)\b.*$/i, '').trim();
  s = s.replace(/\b\d{9,}\b/g, '').trim();
  // Supprime URLs et emails
  s = s.replace(/\b(?:www\.[^\s]+|https?:\/\/[^\s]+)\b/gi, '').trim();
  s = s.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '').trim();
  // Supprime numéros de téléphone
  s = s.replace(/(?:\+?\d[\d\s.\-()]{7,}\d)/g, '').trim();
  // Supprime caractères parasites
  s = s.replace(/[|·•*_]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.length > 1 ? s : null;
};

const isBadSupplierLine = (line: string) => {
  const l = (line || '').toLowerCase().trim();
  if (l.length < 2) return true;
  // Titres de documents
  if (/^(facture|invoice|ticket|reçu|recu|rechnung|quittance|devis|bon de commande)\b/.test(l)) return true;
  // Termes financiers / comptables
  if (/\b(date|total|ttc|tva|ht|montant|amount|sous-total|subtotal|prix\s*ht|arrondi)\b/.test(l)) return true;
  // Codes postaux français ou suisses (CH-XXXX ou 5 chiffres seuls)
  if (/\bch-\d{4}\b/.test(l) || /^\d{4,5}[\s,]/.test(l)) return true;
  // Libellés d'adresse
  if (/\b(rue|avenue|av\.|boulevard|blvd\.|chemin|route|rte\.|place|allée|voie|impasse|quartier)\b/.test(l)) return true;
  // Numéro de facture / référence
  if (/\b(n°|num[eé]ro|number|ref\.?|référence|facture\s*n)\b.*\d/.test(l)) return true;
  // Ligne quasi-numérique
  if (/^[\d\s.,;:/-]+$/.test(l)) return true;
  return false;
};

/** Retourne true si la ligne contient un suffixe juridique de société */
const hasCompanySuffix = (line: string) =>
  /\b(s\.?a\.?r\.?l\.?|s\.?a\.?s\.?|s\.?c\.?i\.?|s\.?n\.?c\.?|e\.?u\.?r\.?l\.?|s\.?a\.|a\.?g\.|g\.?m\.?b\.?h\.?|ltd\.?|l\.?l\.?c\.?|inc\.?|corp\.?|b\.?v\.?|n\.?v\.?|plc\.?)\b/i
    .test(line);

export const extractSupplier = (lines: string[]): string | null => {
  // Priorité 1 : ligne avec label explicite (De:, Société:, Fournisseur:, etc.)
  for (const l of lines.slice(0, 25)) {
    const m = l.match(/^(?:de|from|soci[eé]t[eé]|fournisseur|vendeur|[eé]metteur|exp[eé]diteur|supplier|vendor)\s*[:\-]\s*(.+)/i);
    if (m) {
      const cleaned = cleanSupplierLine(m[1]);
      if (cleaned && !isBadSupplierLine(cleaned)) return cleaned;
    }
  }

  // Priorité 2 : ligne avec suffixe juridique (SA, AG, GmbH, SARL) dans les 20 premières lignes
  for (const l of lines.slice(0, 20)) {
    if (isBadSupplierLine(l)) continue;
    const cleaned = cleanSupplierLine(l);
    if (!cleaned) continue;
    if (hasCompanySuffix(cleaned)) return cleaned;
  }

  // Priorité 3 : première ligne valide dans les 3 premières
  for (const l of lines.slice(0, 3)) {
    const cleaned = cleanSupplierLine(l);
    if (!cleaned || isBadSupplierLine(cleaned)) continue;
    return cleaned;
  }

  // Priorité 4 : première ligne valide dans les 10 premières
  for (const l of lines.slice(0, 10)) {
    const cleaned = cleanSupplierLine(l);
    if (!cleaned || isBadSupplierLine(cleaned)) continue;
    return cleaned;
  }

  const fallback = cleanSupplierLine(lines[0] || '');
  return fallback && !isBadSupplierLine(fallback) ? fallback : null;
};

export const parseInvoice = (text: string): ParsedInvoice => {
  try {
    const normalized = normalizeText(text);
    const lines = splitLines(normalized);

    const date = extractDate(lines);
    const montant = extractAmount(lines);
    const fournisseur = extractSupplier(lines);

    const libelleSupplier = fournisseur || cleanSupplierLine(lines[0] || '') || null;
    let libelle: string | null = null;
    if (libelleSupplier && date) libelle = 'Facture ' + libelleSupplier + ' - ' + date;
    else if (libelleSupplier) libelle = 'Facture ' + libelleSupplier;
    else if (date) libelle = 'Facture - ' + date;

    return { date, fournisseur, montant, libelle };
  } catch {
    return { date: null, fournisseur: null, montant: null, libelle: null };
  }
};
