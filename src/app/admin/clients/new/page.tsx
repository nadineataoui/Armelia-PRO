import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuthSession } from "@/auth";
import ClientForm from "@/components/ClientForm";

export default async function NewClientPage() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/client");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black">Nouveau client</h1>
        <Link
          href="/admin"
          className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
        >
          Retour
        </Link>
      </header>

      <main className="p-6">
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-xl">
          <ClientForm mode="create" />
        </div>
      </main>
    </div>
  );
}
