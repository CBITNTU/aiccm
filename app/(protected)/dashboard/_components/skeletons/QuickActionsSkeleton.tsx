import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function QuickActionsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 bg-muted rounded" />
              <div className="h-5 w-36 bg-muted rounded" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-4 w-full bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
