import type { Role, Team } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      team: Team | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    team: Team | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    team: Team | null;
  }
}
