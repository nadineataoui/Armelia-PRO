"use client";

import { useState } from "react";

export default function DeleteClientButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        const ok = window.confirm("Supprimer ce client et toutes ses factures ?");
        if (!ok) return;
        setLoading(true);
        try {
          const res = await fetch(`/api/admin/clients/${clientId}`, { method: "DELETE" });
          if (!res.ok) {
            alert("Suppression impossible.");
            return;
          }
          window.location.href = "/admin";
        } finally {
          setLoading(false);
        }
      }}
      className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
      {loading ? "Suppression..." : "Supprimer"}
    </button>
  );
}
