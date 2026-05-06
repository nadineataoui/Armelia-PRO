"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginForm({ nextPath }: { nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="w-full max-w-sm space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
          const res = await signIn("credentials", {
            redirect: false,
            email,
            password,
            callbackUrl: nextPath || "/",
          });
          if (!res || res.error) {
            setError("Email ou mot de passe invalide.");
            return;
          }
          window.location.href = res.url || nextPath || "/";
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Mot de passe</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:border-orange-500"
        />
      </div>
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 text-white py-3 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
      >
        {loading ? "Connexion..." : "Se connecter"}
      </button>
    </form>
  );
}
