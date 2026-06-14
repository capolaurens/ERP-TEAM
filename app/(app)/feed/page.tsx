import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/format";
import { FeedGrid, type FeedPost } from "./feed-grid";

export default async function FeedPage() {
  const user = await requireAuth();
  if (user.role !== "ADMIN" && user.role !== "MARKETING") redirect("/");

  const rows = await prisma.instagramPost.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  const posts: FeedPost[] = rows.map((p) => ({
    id: p.id,
    imageUrl: p.imageUrl,
    caption: p.caption,
    status: p.status,
    scheduledInput: toDateInput(p.scheduledAt),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feed de Instagram</h1>
        <p className="text-muted-foreground">
          Planifica y ordena el contenido de @navyx. Arrastra las publicaciones
          para posicionar la cuadrícula y ver cómo quedará el feed.
        </p>
      </div>
      <FeedGrid posts={posts} />
    </div>
  );
}
