import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse" style={{ animationDelay: `${i * 75}ms` }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-4 w-4 bg-muted rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-7 w-12 bg-muted rounded mb-1" />
            <div className="h-3 w-24 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
