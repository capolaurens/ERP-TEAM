import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import authConfig from "@/auth.config";
import { loginAllowed, recordLoginFailure, resetLogin } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        if (!loginAllowed(email)) return null; // bloqueo por fuerza bruta

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          recordLoginFailure(email);
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          recordLoginFailure(email);
          return null;
        }
        resetLogin(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          team: user.team ?? null,
        };
      },
    }),
  ],
});
