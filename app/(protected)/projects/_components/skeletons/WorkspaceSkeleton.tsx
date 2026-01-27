import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function WorkspaceSkeleton() {
  return (
    <Card>
      <CardHeader>
        {/* Project title and status skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-8 w-24 bg-muted rounded animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Accordion panel skeletons */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="border rounded-lg animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 bg-muted rounded" />
                <div className="h-5 w-32 bg-muted rounded" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 bg-muted rounded" />
                <div className="h-4 w-4 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
