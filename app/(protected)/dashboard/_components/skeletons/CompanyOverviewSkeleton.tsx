import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function CompanyOverviewSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-5 w-40 bg-muted rounded mb-2" />
        <div className="h-4 w-56 bg-muted rounded" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex justify-between items-center p-3 bg-muted/30 rounded-lg"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        ))}
        <div className="flex gap-2">
          <div className="h-9 flex-1 bg-muted rounded" />
          <div className="h-9 flex-1 bg-muted rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
