import { prisma } from "@/lib/prisma";

const pad3 = (n: number) => String(n).padStart(3, "0");
const pad4 = (n: number) => String(n).padStart(4, "0");

export const formatClientCode = (n: number) => `CLI${pad3(n)}`;

export const getNextClientCode = async () => {
  const last = await prisma.client.findFirst({
    orderBy: { codeClient: "desc" },
    select: { codeClient: true },
  });
  const m = last?.codeClient?.match(/^CLI(\d{3,})$/i);
  const next = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return formatClientCode(next);
};

export const getNextPieceNumber = async (clientCode: string) => {
  const client = await prisma.client.findUnique({
    where: { codeClient: clientCode },
    select: { id: true, codeClient: true },
  });
  if (!client) throw new Error("Client introuvable.");

  const last = await prisma.invoice.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    select: { numeroPiece: true },
  });

  const m = last?.numeroPiece?.match(new RegExp(`^${client.codeClient}-([0-9]{4,})$`, "i"));
  const next = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${client.codeClient}-${pad4(next)}`;
};

export const getNextPieceNumberByClientId = async (clientId: string) => {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, codeClient: true },
  });
  if (!client) throw new Error("Client introuvable.");

  const last = await prisma.invoice.findFirst({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    select: { numeroPiece: true },
  });

  const m = last?.numeroPiece?.match(new RegExp(`^${client.codeClient}-([0-9]{4,})$`, "i"));
  const next = m ? Number.parseInt(m[1], 10) + 1 : 1;
  return `${client.codeClient}-${pad4(next)}`;
};
