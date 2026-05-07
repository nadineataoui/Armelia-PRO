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

  const totalCredit = invoiceTotals.reduce((s, r) => s + (r._sum.montant ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/40 flex-shrink-0">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-black text-sm leading-none">Armelia PRO</p>
            <p className="hidden sm:block text-slate-500 text-[11px] mt-0.5 truncate">{session.user.email}</p>
          </div>
        </div>

        <nav className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          <a
            href="/api/export/all"
            className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
            title="Export global"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="hidden sm:inline">Export global</span>
          </a>
          <Link
            href="/admin/settings"
            className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span className="hidden sm:inline">Paramètres</span>
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <main className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-black text-slate-900 mb-1">Tableau de bord</h1>
          <p className="text-slate-500 text-sm">Vue d&apos;ensemble de votre activité comptable</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Clients actifs</p>
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-black text-slate-900">{clientCount}</p>
            <p className="text-xs text-slate-400 mt-1">comptes enregistrés</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Factures traitées</p>
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-black text-slate-900">{invoiceCount}</p>
            <p className="text-xs text-slate-400 mt-1">documents numérisés</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total crédits</p>
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {totalCredit.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
            <p className="text-xs text-slate-400 mt-1">montant cumulé</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-900">Clients</h2>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">Gérez les comptes et accès clients</p>
            </div>
            <Link
              href="/admin/clients/new"
              className="flex items-center gap-1.5 bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-xl font-bold text-xs hover:bg-orange-700 transition-colors shadow-sm shadow-orange-600/20 whitespace-nowrap flex-shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              + Nouveau client
            </Link>
          </div>
          <div className="p-4 sm:p-6">
            <AdminClientList clients={clientRows} />
          </div>
        </div>
      </main>
    </div>
  );
}
