import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <PresenceHeartbeat />
      <Sidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={session.user.name ?? "Usuario"}
          email={session.user.email ?? ""}
          role={session.user.role}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
