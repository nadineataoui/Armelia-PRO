"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
    >
      Déconnexion
    </button>
  );
}
