import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { auth } from "@/auth";
import { logout } from "@/app/(auth)/login/actions";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <Link href="/portal" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/navyx_logo.avif" alt="Navyx" className="h-7 w-auto" />
          <span className="text-sm font-medium text-muted-foreground">· Portal de cliente</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{session.user.name}</span>
          <form action={logout}>
            <button
              type="submit"
              title="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
