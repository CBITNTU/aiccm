import { Loader2 } from "lucide-react";

export default function ProtectedLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Skeleton Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <div className="w-8 h-8 bg-muted rounded animate-pulse" />
              <div className="hidden md:flex items-center gap-4">
                <div className="w-20 h-4 bg-muted rounded animate-pulse" />
                <div className="w-16 h-4 bg-muted rounded animate-pulse" />
                <div className="w-24 h-4 bg-muted rounded animate-pulse" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-4 bg-muted rounded animate-pulse" />
              <div className="w-16 h-4 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Loading Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
