import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getNextPieceNumberByClientId } from "@/lib/invoice-number";

export const runtime = "nodejs";

const parseDdMmYyyy = (raw: string) => {
  const s = (raw || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  const yyyy = Number.parseInt(m[3], 10);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return d;
};

// POST /api/admin/invoices — créer une facture pour un client (réservé admin)
export const POST = async (req: Request) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { clientId?: string; date?: string; fournisseur?: string; montant?: string | number; libelle?: string; fileName?: string }
    | null;

  const clientId = (body?.clientId || "").trim();
  const fournisseur = (body?.fournisseur || "").trim();
  const libelle = (body?.libelle || "").trim();
  const fileName = (body?.fileName || "").trim() || null;
  const amountRaw = body?.montant;
  const amount = typeof amountRaw === "number" ? amountRaw : Number.parseFloat(String(amountRaw || "").replace(",", "."));
  const date = parseDdMmYyyy(String(body?.date || ""));

  if (!clientId) return NextResponse.json({ error: "clientId obligatoire." }, { status: 400 });
  if (!date) return NextResponse.json({ error: "Date invalide (format JJ/MM/AAAA)." }, { status: 400 });
  if (!fournisseur) return NextResponse.json({ error: "Fournisseur obligatoire." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
  if (!libelle) return NextResponse.json({ error: "Libellé obligatoire." }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });

  const numeroPiece = await getNextPieceNumberByClientId(clientId);

  const invoice = await prisma.invoice.create({
    data: { clientId, date, fournisseur, montant: amount, libelle, numeroPiece, fileName },
    select: { id: true, date: true, fournisseur: true, montant: true, libelle: true, numeroPiece: true, fileName: true, createdAt: true },
  });

  return NextResponse.json({ invoice });
};
