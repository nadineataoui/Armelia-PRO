import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import ClientForm from "@/components/ClientForm";
import DeleteClientButton from "@/components/DeleteClientButton";
import ClientPasswordReset from "@/components/ClientPasswordReset";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/client");

  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, codeClient: true, nom: true, email: true, telephone: true, adresse: true, users: { select: { email: true }, take: 1 } },
  });
  if (!client) redirect("/admin");

  const invoices = await prisma.invoice.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, date: true, fournisseur: true, montant: true, libelle: true, numeroPiece: true, createdAt: true },
  });

  const total = invoices.reduce((sum, inv) => sum + inv.montant, 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{client.codeClient}</h1>
          <p className="text-xs text-zinc-500 font-bold">{client.nom}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/export/client/${client.id}`}
            className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
          >
            Export Excel
          </a>
          <DeleteClientButton clientId={client.id} />
          <Link
            href="/admin"
            className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
          >
            Retour
          </Link>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Factures</p>
            <p className="text-2xl font-black">{invoices.length}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total crédit</p>
            <p className="text-2xl font-black">{total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Login</p>
            <p className="text-sm font-mono font-bold truncate">{client.users[0]?.email || "—"}</p>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-4">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Adresse</p>
          <p className="text-sm font-bold text-zinc-800">{client.adresse || "—"}</p>
        </div>

        <ClientPasswordReset clientId={client.id} clientCode={client.codeClient} />

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-xl">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-4">Modifier le client</h2>
          <ClientForm mode="edit" clientId={client.id} initial={{ nom: client.nom, email: client.users[0]?.email || client.email, telephone: client.telephone, adresse: client.adresse }} />
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-4">Factures</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune facture.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="border border-zinc-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-sm">{inv.numeroPiece} — {inv.fournisseur}</p>
                    <p className="text-xs text-zinc-500">{inv.libelle}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-black text-sm">
                      {inv.montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-bold">
                      {inv.date.toISOString().slice(0, 10)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
