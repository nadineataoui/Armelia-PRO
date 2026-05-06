"use client";

import { useState } from "react";

const isValidEmail = (value: string) => {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

export default function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        const email = (newEmail || "").trim().toLowerCase();
        if (!isValidEmail(email)) { setMessage({ type: "error", text: "Email invalide." }); return; }
        if (email === (currentEmail || "").trim().toLowerCase()) { setMessage({ type: "error", text: "Le nouvel email doit être différent." }); return; }
        if (!currentPassword.trim()) { setMessage({ type: "error", text: "Mot de passe actuel obligatoire." }); return; }
        setLoading(true);
        try {
          const res = await fetch("/api/admin/change-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newEmail: email, currentPassword }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) { setMessage({ type: "error", text: data?.error || "Erreur lors de la mise à jour." }); return; }
          setMessage({ type: "success", text: "Email mis à jour. Déconnexion en cours..." });
          setCurrentPassword("");
          setTimeout(() => { window.location.href = "/api/auth/signout?callbackUrl=/login"; }, 800);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className={labelCls}>Nouvel email</label>
        <input type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Mot de passe actuel</label>
        <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
      </div>

      {message && (
        <div className={`flex items-center gap-2.5 text-sm font-semibold px-4 py-3 rounded-xl border ${message.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {message.type === "success"
              ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
              : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
            }
          </svg>
          {message.text}
        </div>
      )}

      <button type="submit" disabled={loading} className="bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm shadow-orange-600/20">
        {loading ? "Mise à jour..." : "Mettre à jour l'email"}
      </button>
    </form>
  );
}
