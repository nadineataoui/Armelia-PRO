import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import ClientDashboard from "@/components/ClientDashboard";

export default async function ClientPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CLIENT") redirect("/admin");
  if (!session.user.clientId) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { id: session.user.clientId },
    select: { codeClient: true },
  });
  if (!client) redirect("/login");

  return <ClientDashboard clientCode={client.codeClient} />;
}
