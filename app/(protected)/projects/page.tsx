"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserCompanies, type ProjectStatus } from "@/hooks/useProjects";
import type { Database } from "@/lib/supabase/types";
import { ProjectsHeader } from "./_components/ProjectsHeader";
import { CompanySelector } from "./_components/CompanySelector";
import { ProjectList } from "./_components/ProjectList";
import { ProjectWorkspace } from "./_components/ProjectWorkspace";
import { ProjectListSkeleton } from "./_components/skeletons/ProjectListSkeleton";
import { WorkspaceSkeleton } from "./_components/skeletons/WorkspaceSkeleton";
import { InvitationsBanner } from "@/components/consulting/InvitationsBanner";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  // Read from URL params
  const routeCompanyId = searchParams.get("companyId");
  const routeProjectId = searchParams.get("projectId");

  // Track user's manual selection (null means "use default")
  const [manualCompanyId, setManualCompanyId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    routeProjectId,
  );
  const [projectFilter, setProjectFilter] = useState<ProjectStatus>("active");

  const { data: companies, isLoading: loadingCompanies } = useUserCompanies(
    user?.id ?? null,
  );

  // Derive selected company from available data (no setState in effect)
  const selectedCompany = useMemo<Company | null>(() => {
    if (!companies || companies.length === 0) return null;

    // Priority 1: User's manual selection
    if (manualCompanyId) {
      const manual = companies.find((c) => c.id === manualCompanyId);
      if (manual) return manual;
    }

    // Priority 2: Route parameter
    if (routeCompanyId) {
      const fromRoute = companies.find((c) => c.id === routeCompanyId);
      if (fromRoute) return fromRoute;
    }

    // Priority 3: First company (default)
    return companies[0];
  }, [companies, manualCompanyId, routeCompanyId]);

  // Update URL when selection changes
  const updateUrl = useCallback(
    (companyId: string | null, projectId: string | null) => {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (projectId) params.set("projectId", projectId);

      const queryString = params.toString();
      const newUrl = queryString ? `/projects?${queryString}` : "/projects";

      // Use replace to avoid adding to browser history on every selection
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  // Sync URL when selections change
  useEffect(() => {
    // Only update URL after initial load
    if (!loadingCompanies && selectedCompany) {
      updateUrl(selectedCompany.id, selectedProjectId);
    }
  }, [selectedCompany, selectedProjectId, loadingCompanies, updateUrl]);

  const handleCompanyChange = useCallback(
    (company: Company | null) => {
      if (company?.id !== selectedCompany?.id) {
        setManualCompanyId(company?.id ?? null);
        setSelectedProjectId(null);
      }
    },
    [selectedCompany?.id],
  );

  const handleProjectSelect = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
  }, []);

  // Show loading state while fetching companies
  if (loadingCompanies) {
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
  if (!companies || companies.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ProjectsHeader companyId={null} />
        <CompanySelector
          companies={[]}
          selectedCompany={null}
          onCompanyChange={handleCompanyChange}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ProjectsHeader companyId={selectedCompany?.id} />

      <InvitationsBanner userId={user?.id ?? null} />

      <CompanySelector
        companies={companies}
        selectedCompany={selectedCompany}
        onCompanyChange={handleCompanyChange}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Project List */}
        <ProjectList
          companyId={selectedCompany?.id ?? null}
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
