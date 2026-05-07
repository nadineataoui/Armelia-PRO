import LoginForm from "@/components/LoginForm";
import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const nextPathRaw = sp?.next;
  const nextPath = typeof nextPathRaw === "string" ? nextPathRaw : undefined;

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden lg:flex bg-slate-900 flex-col p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <span className="text-white font-black text-lg tracking-tight">
            Armelia <span className="text-orange-400">PRO</span>
          </span>
        </div>

        <div className="relative mt-auto mb-12">
          <div className="inline-flex items-center gap-2 bg-orange-600/20 border border-orange-500/30 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
            Plateforme comptable intelligente
          </div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            Vos factures,<br />
            <span className="text-orange-400">automatisées.</span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            OCR haute précision, export Excel structuré par client, gestion multi-comptes sécurisée.
          </p>
        </div>

        <div className="relative space-y-3">
          {[
            { label: "Scan PDF & image par OCR" },
            { label: "Export Excel organisé par client" },
            { label: "Espace client individuel sécurisé" },
            { label: "Scan par caméra sur mobile" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <div className="w-5 h-5 bg-orange-600/20 border border-orange-500/30 rounded-md flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-slate-400 text-sm">{f.label}</span>
            </div>
          ))}
        </div>

        <div className="relative mt-12 pt-8 border-t border-slate-800">
          <p className="text-slate-600 text-xs">© 2026 Armelia PRO — Tous droits réservés</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-start justify-center bg-slate-50 pt-12 pb-10 px-5 sm:p-8 min-h-screen lg:min-h-0 lg:items-center">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
              <span className="text-white font-black text-xs">A</span>
            </div>
            <span className="text-slate-900 font-black text-base tracking-tight">
              Armelia <span className="text-orange-600">PRO</span>
            </span>
          </div>

          <h1 className="text-2xl font-black text-slate-900 mb-1">Connexion</h1>
          <p className="text-slate-500 text-sm mb-8">Accédez à votre espace sécurisé.</p>

          <LoginForm nextPath={nextPath} />

          <div className="mt-6 text-center">
            <Link
              className="text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors"
              href="/forgot-password"
            >
              Mot de passe oublié ?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
