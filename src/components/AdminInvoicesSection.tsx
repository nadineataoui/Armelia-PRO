"use client";

import { useState } from "react";
import AdminInvoiceList from "@/components/AdminInvoiceList";
import AdminInvoiceScanner from "@/components/AdminInvoiceScanner";

type InvoiceRow = {
  id: string;
  date: Date;
  fournisseur: string;
  montant: number;
  libelle: string;
  numeroPiece: string;
};

export default function AdminInvoicesSection({
  invoices: initial,
  clientId,
  clientCode,
}: {
  invoices: InvoiceRow[];
  clientId: string;
  clientCode: string;
}) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initial);

  const handleInvoiceAdded = (newInvoice: InvoiceRow) => {
    setInvoices((prev) => [newInvoice, ...prev]);
  };

  return (
    <div className="space-y-4">
      <AdminInvoiceScanner
        clientId={clientId}
        clientCode={clientCode}
        onInvoiceAdded={handleInvoiceAdded}
      />
      <AdminInvoiceList invoices={invoices} clientId={clientId} />
    </div>
  );
}
