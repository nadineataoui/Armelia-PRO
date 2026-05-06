import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, validateNewPassword } from "@/lib/password";

export const POST = async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { token?: string; newPassword?: string } | null;
  const token = (body?.token || "").trim();
  const newPassword = (body?.newPassword || "").trim();

  if (!token || !newPassword) {
    return NextResponse.json(
      { error: "Token et nouveau mot de passe requis." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const v = validateNewPassword(newPassword);
  if (!v.ok) {
    return NextResponse.json({ error: v.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();

  const prt = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true },
  });

  if (!prt) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: prt.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: prt.id }, data: { usedAt: now } }),
  ]);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
};

