import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export const GET = async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, codeClient: true, nom: true, email: true, telephone: true, adresse: true, createdAt: true, updatedAt: true },
  });
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });

  const invoices = await prisma.invoice.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, date: true, fournisseur: true, montant: true, libelle: true, numeroPiece: true, fileName: true, createdAt: true },
  });

  return NextResponse.json({ client, invoices });
};

export const PUT = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { nom?: string; email?: string; telephone?: string; adresse?: string }
    | null;
  const nom = (body?.nom || "").trim();
  const emailRaw = (body?.email || "").trim().toLowerCase();
  const telephone = (body?.telephone || "").trim() || null;
  const adresse = (body?.adresse || "").trim() || null;

  if (!nom) return NextResponse.json({ error: "Nom client obligatoire." }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id },
      data: {
        nom,
        email: emailRaw || null,
        telephone,
        adresse,
      },
      select: { id: true, codeClient: true, nom: true, email: true, telephone: true, adresse: true },
    });

    if (emailRaw) {
      await tx.user.updateMany({
        where: { clientId: id },
        data: { email: emailRaw },
      });
    }

    return client;
  });

  return NextResponse.json({ client: updated });
};

export const DELETE = async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await ctx.params;

  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { clientId: id } });
    await tx.client.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
};
