import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const POST = async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = (body?.email || "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "Email requis." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    if (process.env.NODE_ENV !== "production") {
      const resetUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${rawToken}`;
      return NextResponse.json({ ok: true, resetUrl }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
};

