import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const isValidEmail = (value: string) => {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

export const POST = async (req: Request) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { currentPassword?: string; newEmail?: string }
    | null;
  const currentPassword = (body?.currentPassword || "").trim();
  const newEmail = (body?.newEmail || "").trim().toLowerCase();

  if (!currentPassword) return NextResponse.json({ error: "Mot de passe actuel obligatoire." }, { status: 400 });
  if (!isValidEmail(newEmail)) return NextResponse.json({ error: "Email invalide." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true, role: true },
  });
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  if (newEmail === user.email.toLowerCase()) {
    return NextResponse.json({ error: "Le nouvel email doit être différent." }, { status: 400 });
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { email: newEmail } });

  return NextResponse.json({ ok: true });
};

