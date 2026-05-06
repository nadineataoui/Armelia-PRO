"use client";

import { useState } from "react";

const isValidEmail = (value: string) => {
  const v = (value || "").trim().toLowerCase();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

export default function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);

        const email = (newEmail || "").trim().toLowerCase();
        if (!isValidEmail(email)) {
          setMessage({ type: "error", text: "Email invalide." });
          return;
        }
        if (email === (currentEmail || "").trim().toLowerCase()) {
          setMessage({ type: "error", text: "Le nouvel email doit être différent." });
          return;
        }
        if (!currentPassword.trim()) {
          setMessage({ type: "error", text: "Mot de passe actuel obligatoire." });
          return;
        }

        setLoading(true);
        try {
          const res = await fetch("/api/admin/change-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newEmail: email, currentPassword }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) {
            setMessage({ type: "error", text: data?.error || "Erreur lors de la mise à jour." });
            return;
          }
          setMessage({ type: "success", text: "Email mis à jour. Vous allez être déconnecté." });
          setCurrentPassword("");
          setTimeout(() => {
            window.location.href = "/api/auth/signout?callbackUrl=/login";
          }, 800);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Nouvel email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Mot de passe actuel</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>

      {message && (
        <p className={`text-sm font-bold ${message.type === "success" ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-orange-600 text-white px-5 py-3 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
      >
        {loading ? "Mise à jour..." : "Mettre à jour"}
      </button>
    </form>
  );
}

