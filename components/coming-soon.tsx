import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardContent className="flex items-center gap-4 text-muted-foreground">
          <Construction className="size-6 shrink-0" />
          <p>{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
