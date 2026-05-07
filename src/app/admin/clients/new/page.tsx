import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/auth";
import ClientForm from "@/components/ClientForm";

export default async function NewClientPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/client");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 px-6 h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/40">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <p className="text-white font-black text-sm">Nouveau client</p>
        </div>
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Retour
        </Link>
      </header>

      <main className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 mb-1">Créer un client</h1>
          <p className="text-slate-500 text-sm">Un code client et des identifiants seront générés automatiquement</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <ClientForm mode="create" />
        </div>
      </main>
    </div>
  );
}
