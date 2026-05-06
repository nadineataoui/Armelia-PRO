import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { Role } from "@prisma/client";

const main = async () => {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || "").trim();

  if (!email) throw new Error("ADMIN_EMAIL manquant.");
  if (!password) throw new Error("ADMIN_PASSWORD manquant.");

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.ADMIN, clientId: null },
    create: { email, passwordHash, role: Role.ADMIN, clientId: null },
  });
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    await prisma.$disconnect();
    throw e;
  });
