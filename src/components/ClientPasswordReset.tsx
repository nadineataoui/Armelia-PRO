"use client";

import { useState } from "react";

export default function ClientPasswordReset({ clientId, clientCode }: { clientId: string; clientCode: string }) {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-black text-slate-900">Accès client</h2>
        <p className="text-xs text-slate-400 mt-0.5">Le mot de passe actuel n&apos;est pas consultable pour des raisons de sécurité</p>
      </div>
      <div className="p-6 space-y-4">
        <button
          type="button"
          disabled={loading}
          className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 disabled:opacity-50 transition-colors"
          onClick={() => {
            const ok = window.confirm(`Générer un nouveau mot de passe pour ${clientCode} ? L'ancien ne fonctionnera plus.`);
            if (!ok) return;
            setLoading(true);
            setCopied(false);
            void (async () => {
              try {
                const res = await fetch(`/api/admin/clients/${clientId}/reset-password`, { method: "POST" });
                const data = (await res.json().catch(() => null)) as { error?: string; temporaryPassword?: string } | null;
                if (!res.ok) { alert(data?.error || "Erreur lors de la réinitialisation."); return; }
                const pwd = data?.temporaryPassword || "";
                if (!pwd) { alert("Réinitialisation effectuée, mais aucun mot de passe retourné."); return; }
                setTempPassword(pwd);
              } finally {
                setLoading(false);
              }
            })();
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
          </svg>
          {loading ? "Génération..." : "Générer un nouveau mot de passe"}
        </button>

        {tempPassword && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1">Mot de passe temporaire</p>
              <p className="font-mono font-black text-slate-900 text-sm">{tempPassword}</p>
            </div>
            <button
              type="button"
              className="flex-shrink-0 bg-white border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-amber-50 transition-all"
              onClick={() => {
                void (async () => {
                  try { await navigator.clipboard.writeText(tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
                })();
              }}
            >
              {copied ? "✓ Copié" : "Copier"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
