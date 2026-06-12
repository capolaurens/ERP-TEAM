import type { NextAuthConfig } from "next-auth";
import type { Role, Team } from "@/generated/prisma/enums";

/**
 * Configuración base de Auth.js — SIN dependencias de Node (ni Prisma ni bcrypt),
 * para que pueda usarse en el middleware (edge). El proveedor de credenciales,
 * que sí usa Prisma/bcrypt, se añade en auth.ts.
 */
export default {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true; // permitir ver el login
      }
      // El resto de páginas requieren sesión.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.team = user.team ?? null;
        token.name = user.name ?? token.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.team = (token.team as Team | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
