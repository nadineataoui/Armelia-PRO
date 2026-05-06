"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
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
          if (!res.ok) {
            setError(data?.error || "Erreur.");
            return;
          }
          setDone(true);
          if (data?.resetUrl) setResetUrl(data.resetUrl);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {done && (
        <div className="border border-zinc-200 bg-zinc-50 rounded-2xl p-4">
          <p className="text-sm font-bold text-zinc-700">
            Si un compte existe pour cet email, une procédure de réinitialisation a été générée.
          </p>
          {resetUrl && (
            <div className="mt-3">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Lien (dev)</p>
              <a className="text-sm font-mono font-bold text-orange-700 break-all" href={resetUrl}>
                {resetUrl}
              </a>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 text-white py-3 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
      >
        {loading ? "..." : "Envoyer"}
      </button>

      <div className="text-center">
        <Link className="text-xs font-bold text-zinc-600 hover:text-orange-700" href="/login">
          Retour à la connexion
        </Link>
      </div>
    </form>
  );
}

