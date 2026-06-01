import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";

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

export const DELETE = async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Acces refuse." }, { status: 403 });

  const { id } = await ctx.params;
  await prisma.invoice.delete({ where: { id } });
  return NextResponse.json({ success: true });
};

export const PATCH = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Acces refuse." }, { status: 403 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { date?: string; fournisseur?: string; montant?: string | number; libelle?: string }
    | null;

  const updateData: Record<string, unknown> = {};

  if (body?.date !== undefined) {
    const d = parseDdMmYyyy(String(body.date));
    if (!d) return NextResponse.json({ error: "Date invalide (format JJ/MM/AAAA)." }, { status: 400 });
    updateData.date = d;
  }
  if (body?.fournisseur !== undefined) {
    const f = (body.fournisseur || "").trim();
    if (!f) return NextResponse.json({ error: "Fournisseur obligatoire." }, { status: 400 });
    updateData.fournisseur = f;
  }
  if (body?.montant !== undefined) {
    const amount =
      typeof body.montant === "number"
        ? body.montant
        : Number.parseFloat(String(body.montant).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
    updateData.montant = amount;
  }
  if (body?.libelle !== undefined) {
    updateData.libelle = (body.libelle || "").trim();
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      date: true,
      fournisseur: true,
      montant: true,
      libelle: true,
      numeroPiece: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ invoice });
};
