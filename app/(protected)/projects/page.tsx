"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { type ProjectStatus } from "@/hooks/useProjects";
import { ProjectsHeader } from "./_components/ProjectsHeader";
import { ProjectList } from "./_components/ProjectList";
import { ProjectWorkspace } from "./_components/ProjectWorkspace";
import { ProjectListSkeleton } from "./_components/skeletons/ProjectListSkeleton";
import { WorkspaceSkeleton } from "./_components/skeletons/WorkspaceSkeleton";
import { InvitationsBanner } from "@/components/consulting/InvitationsBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { selectedOrg, setSelectedOrg, isLoading: orgLoading } = useOrg();

  // Read from URL params
  const routeCompanyId = searchParams.get("companyId");
  const routeProjectId = searchParams.get("projectId");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    routeProjectId,
  );
  const [projectFilter, setProjectFilter] = useState<ProjectStatus>("active");

  // Sync URL companyId param to global org context on mount
  useEffect(() => {
    if (routeCompanyId && routeCompanyId !== selectedOrg?.id) {
      setSelectedOrg(routeCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount/route change
  }, [routeCompanyId]);

  // Update URL when selection changes
  const updateUrl = useCallback(
    (companyId: string | null, projectId: string | null) => {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (projectId) params.set("projectId", projectId);

      const queryString = params.toString();
      const newUrl = queryString ? `/projects?${queryString}` : "/projects";

      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  // Sync URL when selections change
  useEffect(() => {
    if (!orgLoading && selectedOrg) {
      updateUrl(selectedOrg.id, selectedProjectId);
    }
  }, [selectedOrg, selectedProjectId, orgLoading, updateUrl]);

  // Reset project selection when org changes
  useEffect(() => {
    setSelectedProjectId(null);
  }, [selectedOrg?.id]);

  const handleProjectSelect = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
  }, []);

  // Show loading state while fetching org context
  if (orgLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ProjectsHeader companyId={null} />
        <div className="h-10 w-64 bg-muted rounded-md animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ProjectListSkeleton />
          <div className="lg:col-span-2">
            <WorkspaceSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // Show empty state if no companies
  if (!selectedOrg) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ProjectsHeader companyId={null} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              No Organization Selected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Select an organization from the sidebar to manage your projects, or create your first company to get started.
            </p>
            <Button asChild className="w-full">
              <Link href="/my-company/new">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Company
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ProjectsHeader companyId={selectedOrg.id} />

      <InvitationsBanner userId={user?.id ?? null} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Project List */}
        <ProjectList
          companyId={selectedOrg.id}
          selectedProjectId={selectedProjectId}
          onSelectProject={handleProjectSelect}
          filter={projectFilter}
          onFilterChange={setProjectFilter}
        />

        {/* Right: Project Workspace */}
        <div className="lg:col-span-2">
          <ProjectWorkspace projectId={selectedProjectId} />
        </div>
      </div>
    </div>
  );
}
