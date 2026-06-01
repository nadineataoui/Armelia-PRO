import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getNextPieceNumberByClientId } from "@/lib/invoice-number";

export const runtime = "nodejs";

const parseDdMmYyyy = (raw: string) => {
  const s = (raw || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  const yyyy = Number.parseInt(m[3], 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return d;
};

export const GET = async () => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "CLIENT") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!session.user.clientId) return NextResponse.json({ error: "Compte client invalide." }, { status: 400 });

  const invoices = await prisma.invoice.findMany({
    where: { clientId: session.user.clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, date: true, fournisseur: true, montant: true, libelle: true, numeroPiece: true, fileName: true, createdAt: true },
  });

  return NextResponse.json({ invoices });
};

export const POST = async (req: Request) => {
  const session = await getServerAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (session.user.role !== "CLIENT") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!session.user.clientId) return NextResponse.json({ error: "Compte client invalide." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as
    | { date?: string; fournisseur?: string; montant?: string | number; libelle?: string; fileName?: string }
    | null;
  const fournisseur = (body?.fournisseur || "").trim();
  const libelle = (body?.libelle || "").trim();
  const fileName = (body?.fileName || "").trim() || null;
  const amountRaw = body?.montant;
  const amount = typeof amountRaw === "number" ? amountRaw : Number.parseFloat(String(amountRaw || "").replace(",", "."));
  const date = parseDdMmYyyy(String(body?.date || ""));

  if (!date) return NextResponse.json({ error: "Date invalide (format JJ/MM/AAAA)." }, { status: 400 });
  if (!fournisseur) return NextResponse.json({ error: "Fournisseur obligatoire." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
  if (!libelle) return NextResponse.json({ error: "Libellé obligatoire." }, { status: 400 });

  const numeroPiece = await getNextPieceNumberByClientId(session.user.clientId);

  const invoice = await prisma.invoice.create({
    data: {
      clientId: session.user.clientId,
      date,
      fournisseur,
      montant: amount,
      libelle,
      numeroPiece,
      fileName,
    },
    select: { id: true, date: true, fournisseur: true, montant: true, libelle: true, numeroPiece: true, fileName: true, createdAt: true },
  });

  // Send email notification (non-blocking)
  void (async () => {
    try {
      const clientData = await prisma.client.findUnique({
        where: { id: session.user.clientId! },
        select: { nom: true, email: true, users: { select: { email: true }, take: 1 } },
      });
      const emailTo = clientData?.users[0]?.email || clientData?.email;
      if (emailTo && clientData) {
        const { sendInvoiceConfirmation } = await import("@/lib/mailer");
        await sendInvoiceConfirmation({
          toEmail: emailTo,
          clientNom: clientData.nom,
          numeroPiece: invoice.numeroPiece,
          fournisseur: invoice.fournisseur,
          montant: invoice.montant,
          date: invoice.date.toLocaleDateString("fr-FR"),
        });
      }
    } catch (e) {
      console.error("[email]", e);
    }
  })();

  return NextResponse.json({ invoice });
};
