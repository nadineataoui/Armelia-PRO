"use client";

import { useState } from "react";

type Mode = "create" | "edit";

export default function ClientForm({
  mode,
  clientId,
  initial,
}: {
  mode: Mode;
  clientId?: string;
  initial?: { nom: string; email?: string | null; telephone?: string | null; adresse?: string | null };
}) {
  const [nom, setNom] = useState(initial?.nom || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [telephone, setTelephone] = useState(initial?.telephone || "");
  const [adresse, setAdresse] = useState(initial?.adresse || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<null | { codeClient: string; email: string; temporaryPassword: string }>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setCreatedCreds(null);
        setLoading(true);
        try {
          if (mode === "create") {
            const res = await fetch("/api/admin/clients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nom, email, telephone, adresse }),
            });
            const data = (await res.json().catch(() => null)) as
              | { error?: string; credentials?: { codeClient: string; email: string; temporaryPassword: string } }
              | null;
            if (!res.ok) {
              setError(data?.error || "Erreur lors de la création.");
              return;
            }
            if (data?.credentials) setCreatedCreds(data.credentials);
            return;
          }

          const res = await fetch(`/api/admin/clients/${clientId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nom, email, telephone, adresse }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) {
            setError(data?.error || "Erreur lors de la mise à jour.");
            return;
          }
          window.location.reload();
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Nom</label>
        <input
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email / login</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Téléphone</label>
        <input
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Adresse</label>
        <input
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
          placeholder="Adresse complète"
        />
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {createdCreds && (
        <div className="border border-orange-200 bg-orange-50 rounded-2xl p-4">
          <p className="text-xs font-black uppercase tracking-widest text-orange-700 mb-2">Identifiants générés</p>
          <div className="text-sm font-mono font-bold space-y-1">
            <div>Client: {createdCreds.codeClient}</div>
            <div>Login: {createdCreds.email}</div>
            <div>Mot de passe: {createdCreds.temporaryPassword}</div>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-orange-600 text-white px-5 py-3 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
      >
        {loading ? "Enregistrement..." : mode === "create" ? "Créer le client" : "Mettre à jour"}
      </button>
    </form>
  );
}
