"use client";

import React, { useState, useMemo } from "react";

type InvoiceRow = {
  id: string;
  date: Date;
  fournisseur: string;
  montant: number;
  libelle: string;
  numeroPiece: string;
};

type EditState = {
  date: string;
  fournisseur: string;
  montant: string;
  libelle: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date) =>
  `${pad2(new Date(d).getUTCDate())}/${pad2(new Date(d).getUTCMonth() + 1)}/${new Date(d).getUTCFullYear()}`;

export default function AdminInvoiceList({
  invoices: initial,
  clientId,
}: {
  invoices: InvoiceRow[];
  clientId: string;
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initial);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ date: "", fournisseur: "", montant: "", libelle: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.fournisseur.toLowerCase().includes(q) ||
        inv.libelle.toLowerCase().includes(q) ||
        inv.numeroPiece.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  const startEdit = (inv: InvoiceRow) => {
    setEditingId(inv.id);
    setEditState({
      date: formatDate(inv.date),
      fournisseur: inv.fournisseur,
      montant: inv.montant.toFixed(2),
      libelle: inv.libelle,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editState.date,
          fournisseur: editState.fournisseur,
          montant: editState.montant,
          libelle: editState.libelle,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(data?.error || "Erreur lors de la sauvegarde.");
        return;
      }
      const data = (await res.json()) as { invoice: { id: string; date: string; fournisseur: string; montant: number; libelle: string; numeroPiece: string; createdAt: string } };
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                date: new Date(data.invoice.date),
                fournisseur: data.invoice.fournisseur,
                montant: data.invoice.montant,
                libelle: data.invoice.libelle,
              }
            : inv
        )
      );
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm("Supprimer cette facture ?")) return;
    setDeletingId(id);
    // Optimistic remove
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) {
        // Restore on failure
        setInvoices(initial);
        alert("Erreur lors de la suppression.");
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Silence unused clientId warning — kept as prop for future use
  void clientId;

  return (
    <div className="space-y-3">
      {/* Search bar + count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher fournisseur, libellé..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
          />
        </div>
        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
          {filtered.length} facture{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-slate-400 text-sm">
            {search ? "Aucune facture ne correspond à la recherche" : "Aucune facture enregistrée"}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((inv) =>
            editingId === inv.id ? (
              <div key={inv.id} className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Date
                    </label>
                    <input
                      value={editState.date}
                      onChange={(e) => setEditState((s) => ({ ...s, date: e.target.value }))}
                      placeholder="JJ/MM/AAAA"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Montant TTC
                    </label>
                    <input
                      value={editState.montant}
                      onChange={(e) => setEditState((s) => ({ ...s, montant: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-orange-500 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Fournisseur
                  </label>
                  <input
                    value={editState.fournisseur}
                    onChange={(e) => setEditState((s) => ({ ...s, fournisseur: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Libellé
                  </label>
                  <input
                    value={editState.libelle}
                    onChange={(e) => setEditState((s) => ({ ...s, libelle: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-all"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void saveEdit(inv.id)}
                    disabled={saving}
                    className="flex items-center gap-1.5 bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex items-center gap-1.5 bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-900 truncate">
                    {inv.numeroPiece} — {inv.fournisseur}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{inv.libelle}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-black text-sm text-slate-900">
                    {inv.montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(inv.date)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(inv)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                    title="Modifier"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteInvoice(inv.id)}
                    disabled={deletingId === inv.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Supprimer"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
