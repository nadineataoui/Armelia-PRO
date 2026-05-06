import ResetPasswordForm from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tokenRaw = sp?.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight mb-2">Réinitialiser le mot de passe</h1>
        <p className="text-sm text-zinc-500 mb-6">Choisissez un nouveau mot de passe.</p>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}

