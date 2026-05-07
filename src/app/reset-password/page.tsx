import ResetPasswordForm from "@/components/ResetPasswordForm";
import Link from "next/link";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tokenRaw = sp?.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 sm:px-6 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
            <span className="text-white font-black text-xs">A</span>
          </div>
          <span className="text-slate-900 font-black text-base">Armelia <span className="text-orange-600">PRO</span></span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8">
          <h1 className="text-xl font-black text-slate-900 mb-1">Nouveau mot de passe</h1>
          <p className="text-slate-500 text-sm mb-7">Choisissez un nouveau mot de passe sécurisé.</p>
          <ResetPasswordForm token={token} />
        </div>
        <div className="mt-5 text-center">
          <Link className="text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors" href="/login">
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
