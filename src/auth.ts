import NextAuth, { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (credentials) => {
        const email = (credentials?.email || "").trim().toLowerCase();
        const password = (credentials?.password || "").trim();
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true, role: true, clientId: true },
        });
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as unknown as { role?: "ADMIN" | "CLIENT" }).role;
        token.clientId = (user as unknown as { clientId?: string | null }).clientId ?? null;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.role = (token as unknown as { role?: "ADMIN" | "CLIENT" }).role || "CLIENT";
        session.user.clientId = (token as unknown as { clientId?: string | null }).clientId ?? null;
      }
      return session;
    },
  },
};

export const getServerAuthSession = async () => {
  return await getServerSession(authOptions);
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
