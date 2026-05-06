"use client";

import { useState } from "react";
import Link from "next/link";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = token.trim().length > 0 && newPassword.length > 0 && confirm.length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        if (!token.trim()) {
          setError("Lien invalide.");
          return;
        }
        if (newPassword !== confirm) {
          setError("La confirmation ne correspond pas.");
          return;
        }
        setLoading(true);
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) {
            setError(data?.error || "Erreur.");
            return;
          }
          setDone(true);
        } finally {
          setLoading(false);
        }
      }}
    >
      {!token.trim() && (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-700">Lien invalide ou manquant.</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Nouveau mot de passe</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
        <p className="mt-2 text-xs text-zinc-500 font-bold">Min 8 caractères, dont 1 chiffre.</p>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Confirmer</label>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {done && (
        <div className="border border-green-200 bg-green-50 rounded-2xl p-4">
          <p className="text-sm font-bold text-green-800">Mot de passe mis à jour. Tu peux te reconnecter.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="w-full bg-orange-600 text-white py-3 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
      >
        {loading ? "..." : "Mettre à jour"}
      </button>

      <div className="text-center">
        <Link className="text-xs font-bold text-zinc-600 hover:text-orange-700" href="/login">
          Retour à la connexion
        </Link>
      </div>
    </form>
  );
}

