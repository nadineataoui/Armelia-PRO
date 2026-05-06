"use client";

import { useState } from "react";

type Mode = "create" | "edit";

const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

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
      className="space-y-5"
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
            if (!res.ok) { setError(data?.error || "Erreur lors de la création."); return; }
            if (data?.credentials) setCreatedCreds(data.credentials);
            return;
          }
          const res = await fetch(`/api/admin/clients/${clientId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nom, email, telephone, adresse }),
          });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) { setError(data?.error || "Erreur lors de la mise à jour."); return; }
          window.location.reload();
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className={labelCls}>Nom complet</label>
        <input required value={nom} onChange={(e) => setNom(e.target.value)} className={inputCls} placeholder="Nom de l'entreprise ou du client" />
      </div>
      <div>
        <label className={labelCls}>Email / login</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@exemple.com" />
      </div>
      <div>
        <label className={labelCls}>Téléphone</label>
        <input value={telephone} onChange={(e) => setTelephone(e.target.value)} className={inputCls} placeholder="+33 6 00 00 00 00" />
      </div>
      <div>
        <label className={labelCls}>Adresse</label>
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={inputCls} placeholder="Adresse complète" />
      </div>

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {createdCreds && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Compte créé avec succès</p>
          <div className="space-y-1 font-mono text-sm text-slate-800">
            <p><span className="text-slate-500">Code :</span> <strong>{createdCreds.codeClient}</strong></p>
            <p><span className="text-slate-500">Login :</span> <strong>{createdCreds.email}</strong></p>
            <p><span className="text-slate-500">Mot de passe :</span> <strong>{createdCreds.temporaryPassword}</strong></p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm shadow-orange-600/20"
      >
        {loading ? "Enregistrement..." : mode === "create" ? "Créer le client" : "Enregistrer les modifications"}
      </button>
    </form>
  );
}
