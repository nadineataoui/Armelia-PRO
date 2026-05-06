import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getNextClientCode } from "@/lib/invoice-number";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { Role } from "@prisma/client";

export const runtime = "nodejs";

export const GET = async () => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const clients = await prisma.client.findMany({
    orderBy: { codeClient: "asc" },
    select: { id: true, codeClient: true, nom: true, email: true, telephone: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ clients });
};

export const POST = async (req: Request) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { nom?: string; email?: string; telephone?: string; adresse?: string }
    | null;
  const nom = (body?.nom || "").trim();
  const emailRaw = (body?.email || "").trim().toLowerCase();
  const telephone = (body?.telephone || "").trim() || null;
  const adresse = (body?.adresse || "").trim() || null;

  if (!nom) return NextResponse.json({ error: "Nom client obligatoire." }, { status: 400 });

  const codeClient = await getNextClientCode();
  const email = emailRaw || `${codeClient.toLowerCase()}@client.local`;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const created = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        codeClient,
        nom,
        email,
        telephone,
        adresse,
      },
      select: { id: true, codeClient: true, nom: true, email: true, telephone: true, adresse: true },
    });

    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: Role.CLIENT,
        clientId: client.id,
      },
      select: { id: true, email: true, role: true, clientId: true },
    });

    return { client, user };
  });

  return NextResponse.json({
    client: created.client,
    credentials: {
      codeClient: created.client.codeClient,
      email: created.user.email,
      temporaryPassword: tempPassword,
    },
  });
};
