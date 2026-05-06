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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 px-6 h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/40">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <div>
            <p className="text-white font-black text-sm leading-none">{client.codeClient}</p>
            <p className="text-slate-500 text-[11px] mt-0.5">{client.nom}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export/client/${client.id}`}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Excel
          </a>
          <DeleteClientButton clientId={client.id} />
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Retour
          </Link>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Factures</p>
            <p className="text-3xl font-black text-slate-900">{invoices.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total crédits</p>
            <p className="text-2xl font-black text-emerald-600">{total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Compte login</p>
            <p className="text-sm font-mono font-bold text-slate-700 truncate">{client.users[0]?.email || "—"}</p>
            {client.adresse && <p className="text-xs text-slate-400 mt-1 truncate">{client.adresse}</p>}
          </div>
        </div>

        <ClientPasswordReset clientId={client.id} clientCode={client.codeClient} />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900">Modifier le client</h2>
          </div>
          <div className="p-6 max-w-xl">
            <ClientForm mode="edit" clientId={client.id} initial={{ nom: client.nom, email: client.users[0]?.email || client.email, telephone: client.telephone, adresse: client.adresse }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Factures</h2>
              <p className="text-xs text-slate-400 mt-0.5">{invoices.length} document{invoices.length > 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="p-4">
            {invoices.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm">Aucune facture enregistrée</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 truncate">{inv.numeroPiece} — {inv.fournisseur}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{inv.libelle}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-black text-sm text-slate-900">
                        {inv.montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {inv.date.toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
