"use client";

import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        setResetUrl(null);
        setLoading(true);
        try {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string; resetUrl?: string } | null;
          if (!res.ok) { setError(data?.error || "Erreur."); return; }
          setDone(true);
          if (data?.resetUrl) setResetUrl(data.resetUrl);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
          placeholder="vous@exemple.com"
        />
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
          <p className="text-sm font-semibold text-emerald-700">
            Si un compte existe pour cet email, une procédure de réinitialisation a été envoyée.
          </p>
          {resetUrl && (
            <div className="mt-3 pt-3 border-t border-emerald-200">
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5">Lien de réinitialisation (dev)</p>
              <a className="text-xs font-mono font-bold text-orange-600 break-all hover:underline" href={resetUrl}>{resetUrl}</a>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm shadow-orange-600/20"
      >
        {loading ? "Envoi en cours..." : "Envoyer le lien"}
      </button>
    </form>
  );
}
