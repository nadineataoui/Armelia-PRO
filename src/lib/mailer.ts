import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInvoiceConfirmation(params: {
  toEmail: string;
  clientNom: string;
  numeroPiece: string;
  fournisseur: string;
  montant: number;
  date: string;
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  await transporter.sendMail({
    from: `"Armelia PRO" <${process.env.SMTP_USER}>`,
    to: params.toEmail,
    subject: `Facture enregistree - ${params.numeroPiece}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #1e293b; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 18px;">
            <span style="background: #ea580c; padding: 4px 10px; border-radius: 8px; margin-right: 10px;">A</span>
            Armelia PRO
          </h1>
        </div>
        <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
          <p style="color: #475569; margin-top: 0;">Bonjour ${params.clientNom},</p>
          <p style="color: #1e293b;">Votre facture a ete enregistree avec succes.</p>
          <div style="background: white; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">N Piece</td><td style="font-weight: bold; text-align: right;">${params.numeroPiece}</td></tr>
              <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Fournisseur</td><td style="font-weight: bold; text-align: right;">${params.fournisseur}</td></tr>
              <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Montant TTC</td><td style="font-weight: bold; color: #10b981; text-align: right;">${params.montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</td></tr>
              <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Date</td><td style="font-weight: bold; text-align: right;">${params.date}</td></tr>
            </table>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Armelia PRO - Gestion comptable simplifiee</p>
        </div>
      </div>
    `,
  });
}
