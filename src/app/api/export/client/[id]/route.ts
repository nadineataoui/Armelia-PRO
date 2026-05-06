import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const formatDdMmYyyy = (d: Date) => {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export const GET = async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, codeClient: true, nom: true },
  });
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });

  const invoices = await prisma.invoice.findMany({
    where: { clientId: client.id },
    orderBy: { date: "asc" },
    select: { date: true, montant: true, numeroPiece: true, libelle: true },
  });

  const rows = invoices.map((inv) => ({
    Date: formatDdMmYyyy(inv.date),
    Débit: 0,
    Crédit: Number(inv.montant.toFixed(2)),
    "Numéro de pièce": inv.numeroPiece,
    Libellé: inv.libelle,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["Date", "Débit", "Crédit", "Numéro de pièce", "Libellé"] });
  XLSX.utils.book_append_sheet(wb, ws, client.codeClient);

  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const fileName = `export_${client.codeClient}.xlsx`;

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
};
