import { requireAuth } from "@/lib/session";
import { VirtualOffice } from "./virtual-office";

export default async function OficinaPage() {
  const user = await requireAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Oficina virtual</h1>
        <p className="text-muted-foreground">
          Quién está trabajando ahora mismo. Tu personaje aparece cuando tienes
          el ERP abierto.
        </p>
      </div>
      <VirtualOffice meId={user.id} />
    </div>
  );
}
