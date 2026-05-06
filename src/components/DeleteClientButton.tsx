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
      className="border border-red-200 bg-white px-4 py-2 rounded-full font-bold text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
    >
      {loading ? "Suppression..." : "Supprimer"}
    </button>
  );
}

