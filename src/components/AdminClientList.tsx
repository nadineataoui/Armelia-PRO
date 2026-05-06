"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AdminClientRow = {
  id: string;
  codeClient: string;
  nom: string;
  email: string | null;
  invoiceCount: number;
  totalCredit: number;
};

export default function AdminClientList({ clients }: { clients: AdminClientRow[] }) {
  const [query, setQuery] = useState("");
  const [resettingClientId, setResettingClientId] = useState<string | null>(null);
  const [tempPasswordByClientId, setTempPasswordByClientId] = useState<Record<string, string>>({});
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.nom, c.codeClient, c.id, c.email || ""].join(" ").toLowerCase().includes(q)
    );
  }, [clients, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom, code, email..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
          />
        </div>
        <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
          {filtered.length} / {clients.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-slate-400 text-sm">Aucun client trouvé</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((c) => (
            <div key={c.id} className="group">
              <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <span className="inline-flex items-center bg-slate-100 text-slate-600 text-[11px] font-bold px-2 py-0.5 rounded-md font-mono">{c.codeClient}</span>
                    <p className="font-bold text-sm text-slate-900 truncate">{c.nom}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{c.email || "—"}</span>
                    <span>·</span>
                    <span>{c.invoiceCount} facture{c.invoiceCount > 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span className="text-emerald-600 font-semibold">{c.totalCredit.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>
                  </div>

                  {tempPasswordByClientId[c.id] && (
                    <div className="mt-2.5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Nouveau mot de passe</p>
                        <p className="font-mono font-black text-sm text-slate-900">{tempPasswordByClientId[c.id]}</p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold bg-white border border-amber-200 text-amber-700 px-2.5 py-1 rounded-lg hover:bg-amber-50 transition-all"
                        onClick={() => {
                          const pwd = tempPasswordByClientId[c.id];
                          if (!pwd) return;
                          void (async () => {
                            try {
                              await navigator.clipboard.writeText(pwd);
                              setCopiedClientId(c.id);
                              setTimeout(() => setCopiedClientId((prev) => (prev === c.id ? null : prev)), 1500);
                            } catch {}
                          })();
                        }}
                      >
                        {copiedClientId === c.id ? "✓ Copié" : "Copier"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-200 transition-colors"
                  >
                    Détail
                  </Link>
                  <a
                    href={`/api/export/client/${c.id}`}
                    className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-200 transition-colors"
                  >
                    Excel
                  </a>
                  <button
                    type="button"
                    disabled={resettingClientId === c.id}
                    className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-200 transition-colors disabled:opacity-50"
                    onClick={() => {
                      const ok = window.confirm(`Générer un nouveau mot de passe pour ${c.codeClient} ? L'ancien ne fonctionnera plus.`);
                      if (!ok) return;
                      setResettingClientId(c.id);
                      void (async () => {
                        try {
                          const res = await fetch(`/api/admin/clients/${c.id}/reset-password`, { method: "POST" });
                          const data = (await res.json().catch(() => null)) as { error?: string; temporaryPassword?: string } | null;
                          if (!res.ok) { alert(data?.error || "Erreur."); return; }
                          const pwd = data?.temporaryPassword || "";
                          if (!pwd) { alert("Réinitialisation effectuée, mot de passe non retourné."); return; }
                          setTempPasswordByClientId((prev) => ({ ...prev, [c.id]: pwd }));
                        } finally {
                          setResettingClientId((prev) => (prev === c.id ? null : prev));
                        }
                      })();
                    }}
                  >
                    {resettingClientId === c.id ? "..." : "Nouveau MDP"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
