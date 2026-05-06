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

export const GET = async () => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const clients = await prisma.client.findMany({
    orderBy: { codeClient: "asc" },
    select: {
      codeClient: true,
      nom: true,
      invoices: {
        orderBy: { date: "asc" },
        select: { date: true, montant: true, numeroPiece: true, libelle: true },
      },
    },
  });

  const wb = XLSX.utils.book_new();

  for (const client of clients) {
    const rows = client.invoices.map((inv) => ({
      Date: formatDdMmYyyy(inv.date),
      Débit: 0,
      Crédit: Number(inv.montant.toFixed(2)),
      "Numéro de pièce": inv.numeroPiece,
      Libellé: inv.libelle,
    }));

    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0 ? rows : [{ Date: "", Débit: "", Crédit: "", "Numéro de pièce": "", Libellé: "" }],
      { header: ["Date", "Débit", "Crédit", "Numéro de pièce", "Libellé"] }
    );

    // Sheet names are limited to 31 chars in Excel
    const sheetName = `${client.codeClient} - ${client.nom}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const fileName = `export_tous_clients_${dateStr}.xlsx`;

  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
};
