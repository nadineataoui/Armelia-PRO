"use client";

import { useState } from "react";

const EyeIcon = ({ open }: { open: boolean }) => {
  if (open) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
};

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);

        if (!currentPassword.trim()) {
          setMessage({ type: "error", text: "Mot de passe actuel obligatoire." });
          return;
        }
        if (newPassword.trim().length < 8) {
          setMessage({ type: "error", text: "Le nouveau mot de passe doit faire au moins 8 caractères." });
          return;
        }
        if (!/\d/.test(newPassword)) {
          setMessage({ type: "error", text: "Le nouveau mot de passe doit contenir au moins 1 chiffre." });
          return;
        }
        if (confirm !== newPassword) {
          setMessage({ type: "error", text: "La confirmation ne correspond pas." });
          return;
        }

        setLoading(true);
        try {
          const res = await fetch("/api/admin/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) {
            setMessage({ type: "error", text: data?.error || "Erreur lors de la mise à jour." });
            return;
          }
          setMessage({ type: "success", text: "Mot de passe mis à jour. Vous allez être déconnecté." });
          setCurrentPassword("");
          setNewPassword("");
          setConfirm("");
          setTimeout(() => {
            window.location.href = "/api/auth/signout?callbackUrl=/login";
          }, 800);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Mot de passe actuel</label>
          <button
            type="button"
            onClick={() => setShowCurrentPassword((v) => !v)}
            className="text-orange-700 hover:text-orange-800 p-1 rounded-lg hover:bg-orange-50 transition-colors"
            aria-pressed={showCurrentPassword}
            aria-label={showCurrentPassword ? "Masquer le mot de passe actuel" : "Afficher le mot de passe actuel"}
            title={showCurrentPassword ? "Masquer" : "Afficher"}
          >
            <EyeIcon open={showCurrentPassword} />
          </button>
        </div>
        <input
          type={showCurrentPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Nouveau mot de passe</label>
          <button
            type="button"
            onClick={() => setShowNewPassword((v) => !v)}
            className="text-orange-700 hover:text-orange-800 p-1 rounded-lg hover:bg-orange-50 transition-colors"
            aria-pressed={showNewPassword}
            aria-label={showNewPassword ? "Masquer le nouveau mot de passe" : "Afficher le nouveau mot de passe"}
            title={showNewPassword ? "Masquer" : "Afficher"}
          >
            <EyeIcon open={showNewPassword} />
          </button>
        </div>
        <input
          type={showNewPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Confirmer le mot de passe</label>
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            className="text-orange-700 hover:text-orange-800 p-1 rounded-lg hover:bg-orange-50 transition-colors"
            aria-pressed={showConfirmPassword}
            aria-label={showConfirmPassword ? "Masquer la confirmation" : "Afficher la confirmation"}
            title={showConfirmPassword ? "Masquer" : "Afficher"}
          >
            <EyeIcon open={showConfirmPassword} />
          </button>
        </div>
        <input
          type={showConfirmPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
