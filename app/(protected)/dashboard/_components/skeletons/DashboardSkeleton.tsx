import { StatsCardsSkeleton } from "./StatsCardsSkeleton";
import { PerformanceBenchmarkSkeleton } from "./PerformanceBenchmarkSkeleton";
import { CompanyOverviewSkeleton } from "./CompanyOverviewSkeleton";
import { QuickActionsSkeleton } from "./QuickActionsSkeleton";

export function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-4 w-80 bg-muted rounded animate-pulse mt-2" />
      </div>

      <StatsCardsSkeleton />

      {/* Performance + Company overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <PerformanceBenchmarkSkeleton />
        <CompanyOverviewSkeleton />
      </div>

      <QuickActionsSkeleton />
    </div>
  );
}
