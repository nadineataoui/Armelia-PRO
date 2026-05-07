"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span className="hidden sm:inline">Déconnexion</span>
    </button>
  );
}
