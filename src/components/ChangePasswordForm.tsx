"use client";

import { useState } from "react";

const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

const EyeButton = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
    aria-label={show ? "Masquer" : "Afficher"}
  >
    {show ? (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    )}
  </button>
);

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        if (!currentPassword.trim()) { setMessage({ type: "error", text: "Mot de passe actuel obligatoire." }); return; }
        if (newPassword.trim().length < 8) { setMessage({ type: "error", text: "Minimum 8 caractères." }); return; }
        if (!/\d/.test(newPassword)) { setMessage({ type: "error", text: "Au moins 1 chiffre requis." }); return; }
        if (confirm !== newPassword) { setMessage({ type: "error", text: "La confirmation ne correspond pas." }); return; }
        setLoading(true);
        try {
          const res = await fetch("/api/admin/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) { setMessage({ type: "error", text: data?.error || "Erreur lors de la mise à jour." }); return; }
          setMessage({ type: "success", text: "Mot de passe mis à jour. Déconnexion en cours..." });
          setCurrentPassword(""); setNewPassword(""); setConfirm("");
          setTimeout(() => { window.location.href = "/api/auth/signout?callbackUrl=/login"; }, 800);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className={labelCls}>Mot de passe actuel</label>
        <div className="relative">
          <input type={showCurrent ? "text" : "password"} autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          <EyeButton show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Nouveau mot de passe</label>
        <div className="relative">
          <input type={showNew ? "text" : "password"} autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          <EyeButton show={showNew} onToggle={() => setShowNew((v) => !v)} />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Minimum 8 caractères dont 1 chiffre</p>
      </div>
      <div>
        <label className={labelCls}>Confirmer le mot de passe</label>
        <div className="relative">
          <input type={showConfirm ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="••••••••" />
          <EyeButton show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
        </div>
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
        {loading ? "Mise à jour..." : "Changer le mot de passe"}
      </button>
    </form>
  );
}
