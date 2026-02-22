import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PerformanceBenchmarkSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="h-5 w-64 bg-muted rounded mb-2" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-16 bg-muted rounded" />
            <div className="h-8 w-20 bg-muted rounded" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] bg-muted/50 rounded-lg mb-4" />
        <div className="h-16 bg-muted/30 rounded-lg" />
      </CardContent>
    </Card>
  );
}
