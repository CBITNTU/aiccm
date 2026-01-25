import { ProjectListSkeleton } from "./_components/skeletons/ProjectListSkeleton";
import { WorkspaceSkeleton } from "./_components/skeletons/WorkspaceSkeleton";

export default function ProjectsLoading() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded-md animate-pulse mt-2" />
        </div>
        <div className="h-10 w-32 bg-muted rounded-md animate-pulse" />
      </div>

      {/* Company selector skeleton */}
      <div className="h-10 w-64 bg-muted rounded-md animate-pulse" />

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ProjectListSkeleton />
        <div className="lg:col-span-2">
          <WorkspaceSkeleton />
        </div>
      </div>
    </div>
  );
}
