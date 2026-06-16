import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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

  const running = await prisma.timeEntry.findFirst({
    where: { userId: session.user.id, endedAt: null },
    include: { task: true },
  });

  return (
    <div className="flex min-h-screen">
      <PresenceHeartbeat />
      <Sidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={session.user.name ?? "Usuario"}
          email={session.user.email ?? ""}
          role={session.user.role}
          running={
            running
              ? {
                  startedAt: running.startedAt.toISOString(),
                  taskTitle: running.task?.title ?? "Tarea",
                  taskId: running.taskId ?? "",
                }
              : null
          }
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
