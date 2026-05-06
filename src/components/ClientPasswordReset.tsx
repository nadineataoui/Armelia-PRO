"use client";

import { useState } from "react";

export default function ClientPasswordReset({ clientId, clientCode }: { clientId: string; clientCode: string }) {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-xl">
      <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-4">Mot de passe client</h2>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={loading}
          className="bg-orange-600 text-white px-5 py-3 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
          onClick={() => {
            const ok = window.confirm(`Générer un nouveau mot de passe pour ${clientCode} ? L'ancien ne fonctionnera plus.`);
            if (!ok) return;
            setLoading(true);
            setCopied(false);
            void (async () => {
              try {
                const res = await fetch(`/api/admin/clients/${clientId}/reset-password`, { method: "POST" });
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
                setTempPassword(pwd);
              } finally {
                setLoading(false);
              }
            })();
          }}
        >
          {loading ? "..." : "Générer un nouveau mot de passe"}
        </button>
        <span className="text-xs text-zinc-500 font-bold">
          Le mot de passe actuel n’est pas consultable (sécurité).
        </span>
      </div>

      {tempPassword && (
        <div className="mt-4 border border-orange-200 bg-orange-50 rounded-2xl p-4">
          <p className="text-xs font-black uppercase tracking-widest text-orange-700 mb-2">Mot de passe temporaire</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-black">{tempPassword}</span>
            <button
              type="button"
              className="border border-orange-200 bg-white px-3 py-1.5 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(tempPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 900);
                  } catch {
                  }
                })();
              }}
            >
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
