import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { effectiveSeed } from "@/lib/avatars";
import { VirtualOffice } from "./virtual-office";
import { AvatarPicker } from "./avatar-picker";

export default async function OficinaPage() {
  const user = await requireAuth();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarSeed: true, name: true },
  });
  const seed = effectiveSeed(me?.avatarSeed, me?.name ?? user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Oficina virtual</h1>
          <p className="text-muted-foreground">
            Quién está trabajando ahora mismo. Tu personaje aparece cuando tienes
            el ERP abierto.
          </p>
        </div>
        <AvatarPicker initialSeed={seed} />
      </div>
      <VirtualOffice meId={user.id} />
    </div>
  );
}
