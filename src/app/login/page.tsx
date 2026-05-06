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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight mb-2">Connexion</h1>
        <p className="text-sm text-zinc-500 mb-6">Accédez à votre espace sécurisé.</p>
        <LoginForm nextPath={nextPath} />
        <div className="mt-4 text-center">
          <Link className="text-xs font-bold text-zinc-600 hover:text-orange-700" href="/forgot-password">
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
    </div>
  );
}
