import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export const POST = async (req: Request) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { currentPassword?: string; newPassword?: string }
    | null;
  const currentPassword = (body?.currentPassword || "").trim();
  const newPassword = (body?.newPassword || "").trim();

  if (!currentPassword) return NextResponse.json({ error: "Mot de passe actuel obligatoire." }, { status: 400 });
  const valid = validateNewPassword(newPassword);
  if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true, role: true },
  });
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
};
