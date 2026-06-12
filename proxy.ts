import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Next 16 renombró "middleware" a "proxy". Auth.js valida la sesión en cada
// petición usando la config base (edge-safe), sin Prisma ni bcrypt.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protege todo excepto API, estáticos de Next y archivos con extensión.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
