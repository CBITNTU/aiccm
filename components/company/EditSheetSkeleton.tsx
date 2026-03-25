"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function EditSheetSkeleton() {
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[1fr_1.5fr] gap-6 h-full">
      {/* Left column skeleton */}
      <div className="space-y-4">
        {/* Description */}
        <Skeleton className="h-4 w-3/4" />
        {/* Search input */}
        <Skeleton className="h-10 w-full rounded-md" />
        {/* Selected badges area */}
        <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      </div>
      {/* Right column skeleton: tree */}
      <Card className="h-full flex flex-col">
        <CardContent className="p-4 flex-1 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-2" style={{ paddingLeft: (i % 3) * 16 + 8 }}>
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-4 rounded-sm" />
              <Skeleton className="h-4 flex-1 max-w-[200px]" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
