import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/LogoutButton";
import AdminClientList from "@/components/AdminClientList";

export default async function AdminPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/client");

  const [clientCount, invoiceCount, clients, invoiceTotals] = await Promise.all([
    prisma.client.count(),
    prisma.invoice.count(),
    prisma.client.findMany({
      orderBy: { codeClient: "asc" },
      select: {
        id: true,
        codeClient: true,
        nom: true,
        users: { select: { email: true }, take: 1 },
        _count: { select: { invoices: true } },
      },
    }),
    prisma.invoice.groupBy({
      by: ["clientId"],
      _sum: { montant: true },
    }),
  ]);

  const totalByClientId = new Map<string, number>();
  invoiceTotals.forEach((row) => {
    totalByClientId.set(row.clientId, row._sum.montant ?? 0);
  });

  const clientRows = clients.map((c) => ({
    id: c.id,
    codeClient: c.codeClient,
    nom: c.nom,
    email: c.users[0]?.email || null,
    invoiceCount: c._count.invoices,
    totalCredit: totalByClientId.get(c.id) ?? 0,
  }));

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Admin</h1>
          <p className="text-xs text-zinc-500 font-bold">{session.user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
          >
            Paramètres
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Clients</p>
            <p className="text-2xl font-black">{clientCount}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Factures</p>
            <p className="text-2xl font-black">{invoiceCount}</p>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">Clients</h2>
            <Link
              href="/admin/clients/new"
              className="bg-orange-600 text-white px-4 py-2 rounded-full font-black text-xs hover:bg-orange-700 transition-colors"
            >
              Ajouter un client
            </Link>
          </div>

          <AdminClientList clients={clientRows} />
        </div>
      </main>
    </div>
  );
}
