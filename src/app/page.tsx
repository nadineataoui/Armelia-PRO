import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/auth";

export default async function Home() {
  const session = await getServerAuthSession();

  if (!session?.user) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin");
  redirect("/client");
}
