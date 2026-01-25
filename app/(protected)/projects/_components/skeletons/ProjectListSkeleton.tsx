import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ProjectListSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        {/* Tabs skeleton */}
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-muted rounded-md animate-pulse" />
          <div className="h-8 w-24 bg-muted rounded-md animate-pulse" />
          <div className="h-8 w-20 bg-muted rounded-md animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Project card skeletons */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 border rounded-lg space-y-3 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-36 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
            <div className="h-4 w-48 bg-muted rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-20 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
          </div>
        ))}

        {/* New project button skeleton */}
        <div className="h-10 w-full bg-muted rounded-md animate-pulse mt-4" />
      </CardContent>
    </Card>
  );
}
