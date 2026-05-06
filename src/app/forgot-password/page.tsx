import ForgotPasswordForm from "@/components/ForgotPasswordForm";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
            <span className="text-white font-black text-xs">A</span>
          </div>
          <span className="text-slate-900 font-black text-base">Armelia <span className="text-orange-600">PRO</span></span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-black text-slate-900 mb-1">Mot de passe oublié</h1>
          <p className="text-slate-500 text-sm mb-7">Saisissez votre email. Si un compte existe, vous recevrez la procédure.</p>
          <ForgotPasswordForm />
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
