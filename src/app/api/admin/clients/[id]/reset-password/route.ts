import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTempPassword, hashPassword } from "@/lib/password";

export const runtime = "nodejs";

export const POST = async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await ctx.params;

  const user = await prisma.user.findFirst({
    where: { clientId: id, role: "CLIENT" },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Compte client introuvable." }, { status: 404 });

  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ temporaryPassword });
};

