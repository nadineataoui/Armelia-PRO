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
  const s = (raw || '').replace(/[\s\u00a0\u202f]/g, '').replace(/[€$]/g, '');
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

export const extractDate = (lines: string[], now = new Date()): string | null => {
  // Règle: prendre la première date cohérente, ignorer les dates futures.
  const today = startOfTodayUtc(now).getTime();

  const patterns: Array<(s: string) => { yyyy: number; mm: number; dd: number } | null> = [
    (s) => {
      const m = s.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
      if (!m) return null;
      return { dd: Number(m[1]), mm: Number(m[2]), yyyy: Number(m[3]) };
    },
    (s) => {
      const m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
      if (!m) return null;
      return { yyyy: Number(m[1]), mm: Number(m[2]), dd: Number(m[3]) };
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
  // Règle: priorité aux lignes TTC / Total TTC / Total, ignorer TVA/HT.
  const amountRegex = /\b(\d{1,3}(?:[ .\u00a0\u202f]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))\b/g;

  const scoreLine = (line: string) => {
    const l = line.toLowerCase();
    const hasTtc = /\bttc\b/.test(l) || /total\s*ttc/.test(l);
    const hasTotal = /\btotal\b/.test(l);
    const hasVatOrHt = /\btva\b/.test(l) || /\bht\b/.test(l);
    if (hasVatOrHt && !hasTtc) return -10;
    return (hasTtc ? 10 : 0) + (hasTotal ? 3 : 0);
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
  s = s.replace(/\b(siret|rcs|tva|vat|n°)\b.*$/i, '').trim();
  s = s.replace(/\b\d{9,}\b/g, '').trim();
  s = s.replace(/\b(?:www\.[^\s]+|https?:\/\/[^\s]+)\b/gi, '').trim();
  s = s.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '').trim();
  s = s.replace(/[|·•]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.length > 0 ? s : null;
};

const isBadSupplierLine = (line: string) => {
  const l = (line || '').toLowerCase();
  if (l.length < 2) return true;
  if (/^facture\b|^invoice\b|^ticket\b|^reçu\b|^recu\b/.test(l)) return true;
  if (/\b(date|total|ttc|tva|ht)\b/.test(l)) return true;
  if (/\b\d{5}\b/.test(l)) return true;
  return false;
};

export const extractSupplier = (lines: string[]): string | null => {
  // Règle: fournisseur généralement en haut, prendre dans les 1 à 3 premières lignes valides.
  const head = lines.slice(0, 10);
  const firstThree = head.slice(0, 3);

  for (const l of firstThree) {
    const cleaned = cleanSupplierLine(l);
    if (!cleaned) continue;
    if (isBadSupplierLine(cleaned)) continue;
    return cleaned;
  }

  for (const l of head) {
    const cleaned = cleanSupplierLine(l);
    if (!cleaned) continue;
    if (isBadSupplierLine(cleaned)) continue;
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
    if (libelleSupplier && date) libelle = `Facture ${libelleSupplier} - ${date}`;
    else if (libelleSupplier) libelle = `Facture ${libelleSupplier}`;
    else if (date) libelle = `Facture - ${date}`;

    return { date, fournisseur, montant, libelle };
  } catch {
    return { date: null, fournisseur: null, montant: null, libelle: null };
  }
};
