import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import ChangeEmailForm from "@/components/ChangeEmailForm";

export default async function AdminSettingsPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/client");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Paramètres admin</h1>
          <p className="text-xs text-zinc-500 font-bold">{session.user.email}</p>
        </div>
        <Link
          href="/admin"
          className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
        >
          Retour
        </Link>
      </header>

      <main className="p-6">
        <div className="space-y-6 max-w-xl">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-4">Changer l’email</h2>
            <ChangeEmailForm currentEmail={session.user.email || ""} />
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-4">Changer le mot de passe</h2>
            <ChangePasswordForm />
          </div>
        </div>
      </main>
    </div>
  );
}
