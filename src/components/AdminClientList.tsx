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
    return clients.filter((c) => {
      const haystack = [
        c.nom,
        c.codeClient,
        c.id,
        c.email || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [clients, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (nom, prénom, code CLI001, email, id...)"
          className="w-full md:max-w-md bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
        <div className="text-xs font-bold text-zinc-500">
          {filtered.length} / {clients.length}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun client trouvé.</p>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 border border-zinc-100 rounded-xl p-3">
              <div>
                <p className="font-black text-sm">{c.codeClient} — {c.nom}</p>
                <p className="text-xs text-zinc-500">{c.email || "—"}</p>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  Factures : {c.invoiceCount} • Total crédits : {c.totalCredit.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                </p>
                {tempPasswordByClientId[c.id] && (
                  <div className="mt-3 border border-orange-200 bg-orange-50 rounded-2xl p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Mot de passe temporaire</p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-black">{tempPasswordByClientId[c.id]}</span>
                      <button
                        type="button"
                        className="border border-orange-200 bg-white px-3 py-1.5 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
                        onClick={() => {
                          const pwd = tempPasswordByClientId[c.id];
                          if (!pwd) return;
                          void (async () => {
                            try {
                              await navigator.clipboard.writeText(pwd);
                              setCopiedClientId(c.id);
                              setTimeout(() => setCopiedClientId((prev) => (prev === c.id ? null : prev)), 900);
                            } catch {
                            }
                          })();
                        }}
                      >
                        {copiedClientId === c.id ? "Copié" : "Copier"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="border border-zinc-200 bg-white px-3 py-1.5 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  Détail
                </Link>
                <a
                  href={`/api/export/client/${c.id}`}
                  className="border border-zinc-200 bg-white px-3 py-1.5 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  Export Excel
                </a>
                <button
                  type="button"
                  disabled={resettingClientId === c.id}
                  className="border border-zinc-200 bg-white px-3 py-1.5 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all disabled:opacity-50"
                  onClick={() => {
                    const ok = window.confirm(`Générer un nouveau mot de passe pour ${c.codeClient} ? L'ancien ne fonctionnera plus.`);
                    if (!ok) return;
                    setResettingClientId(c.id);
                    void (async () => {
                      try {
                        const res = await fetch(`/api/admin/clients/${c.id}/reset-password`, { method: "POST" });
                        const data = (await res.json().catch(() => null)) as { error?: string; temporaryPassword?: string } | null;
                        if (!res.ok) {
                          alert(data?.error || "Erreur lors de la réinitialisation.");
                          return;
                        }
                        const pwd = data?.temporaryPassword || "";
                        if (!pwd) {
                          alert("Réinitialisation effectuée, mais aucun mot de passe n’a été retourné.");
                          return;
                        }
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
          ))
        )}
      </div>
    </div>
  );
}
