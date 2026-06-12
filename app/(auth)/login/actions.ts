"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Email o contraseña incorrectos.";
    }
    // signIn lanza un redirect en caso de éxito: hay que re-lanzarlo.
    throw error;
  }
  return undefined;
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
