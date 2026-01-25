"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserCompanies, type ProjectStatus } from "@/hooks/useProjects";
import type { Database } from "@/lib/supabase/types";
import { ProjectsHeader } from "./_components/ProjectsHeader";
import { CompanySelector } from "./_components/CompanySelector";
import { ProjectList } from "./_components/ProjectList";
import { ProjectWorkspace } from "./_components/ProjectWorkspace";
import { ProjectListSkeleton } from "./_components/skeletons/ProjectListSkeleton";
import { WorkspaceSkeleton } from "./_components/skeletons/WorkspaceSkeleton";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const routeCompanyId = searchParams.get("companyId");

  // Track user's manual selection (null means "use default")
  const [manualCompanyId, setManualCompanyId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<ProjectStatus>("active");

  const { data: companies, isLoading: loadingCompanies } = useUserCompanies(
    user?.id ?? null
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

  const handleCompanyChange = useCallback(
    (company: Company | null) => {
      if (company?.id !== selectedCompany?.id) {
        setManualCompanyId(company?.id ?? null);
        setSelectedProjectId(null);
      }
    },
    [selectedCompany?.id]
  );

  // Show loading state while fetching companies
  if (loadingCompanies) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <ProjectsHeader />
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
      <div className="container mx-auto py-6 space-y-6">
        <ProjectsHeader />
        <CompanySelector
          companies={[]}
          selectedCompany={null}
          onCompanyChange={handleCompanyChange}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <ProjectsHeader />

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
          onSelectProject={setSelectedProjectId}
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
