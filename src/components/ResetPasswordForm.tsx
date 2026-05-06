"use client";

import { useState } from "react";
import Link from "next/link";

const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = token.trim().length > 0 && newPassword.length > 0 && confirm.length > 0;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        if (!token.trim()) { setError("Lien invalide."); return; }
        if (newPassword !== confirm) { setError("La confirmation ne correspond pas."); return; }
        setLoading(true);
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) { setError(data?.error || "Erreur."); return; }
          setDone(true);
        } finally {
          setLoading(false);
        }
      }}
    >
      {!token.trim() && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Lien invalide ou manquant.
        </div>
      )}

      <div>
        <label className={labelCls}>Nouveau mot de passe</label>
        <input type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
        <p className="mt-1.5 text-xs text-slate-400">Minimum 8 caractères dont 1 chiffre</p>
      </div>

      <div>
        <label className={labelCls}>Confirmer le mot de passe</label>
        <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="••••••••" />
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-700">Mot de passe mis à jour. Vous pouvez vous reconnecter.</p>
        </div>
      )}

      <button type="submit" disabled={loading || !canSubmit} className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm shadow-orange-600/20">
        {loading ? "Mise à jour..." : "Définir le nouveau mot de passe"}
      </button>

      <div className="text-center">
        <Link className="text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors" href="/login">
          ← Retour à la connexion
        </Link>
      </div>
    </form>
  );
}
