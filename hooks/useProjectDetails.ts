"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { CompanyRecord } from "@/lib/api/types";
import type {
  Project,
  GapAnalysis,
  TeamAnalysis,
  RecommendedPartner,
} from "./useProjects";

export interface Tender {
  id: string;
  title: string;
  buyer: string;
  buyer_name?: string;
  location?: string;
  region?: string;
  deadline?: string;
  budget_min?: number;
  budget_max?: number;
  value?: number;
  description?: string;
  external_id?: string;
  reference_number?: string;
}

export interface TeamMember {
  id: string;
  vo_id: string;
  company_id: string;
  role: string;
  created_at: string;
  joined_at: string | null;
  invitation_status?: string | null;
  invitation_sent_at?: string | null;
  invitation_responded_at?: string | null;
  invitation_message?: string | null;
  companies: {
    id: string;
    company_name: string;
    key_capabilities?: string | null;
    postcode?: string | null;
    location?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    certifications?: string | null;
    past_projects?: string | null;
    description?: string | null;
  } | null;
}

/** Tender match result for lead company + tender (used when project has no partners). */
export interface TenderMatchResult {
  id: string;
  overall_score: number | null;
  capability_score: number | null;
  experience_score: number | null;
  location_score: number | null;
  certification_score: number | null;
  match_reasons: string[] | null;
  ai_analysis: { score_explanations?: Record<string, string> } | null;
}

export interface ProjectDetails {
  project: Project;
  tender: Tender | null;
  teamMembers: TeamMember[];
  gapAnalysis: GapAnalysis | null;
  teamAnalysis: TeamAnalysis | null;
  recommendedPartners: RecommendedPartner[];
  /** When team is only lead (no partners), gap is derived from this tender match. */
  tenderMatchResult: TenderMatchResult | null;
  isOwner: boolean;
}

async function fetchProjectDetails(projectId: string): Promise<ProjectDetails> {
  const data = await api.getProjectDetails(projectId);

  const project = data.project as unknown as Project;
  const tender = project.tenders as unknown as Tender | null;
  const teamMembers = (data.teamMembers as unknown as TeamMember[]) || [];
  const tenderMatchResult =
    (data.tenderMatchResult as unknown as TenderMatchResult) || null;
  const isOwner = data.isOwner !== false; // default true for backwards compat

  return {
    project,
    tender,
    teamMembers,
    gapAnalysis: project.gap_analysis || null,
    teamAnalysis: project.team_analysis || null,
    recommendedPartners: project.recommended_partners || [],
    tenderMatchResult,
    isOwner,
  };
}

export function useProjectDetails(projectId: string | null) {
  return useQuery({
    queryKey: ["projectDetails", projectId],
    queryFn: () => fetchProjectDetails(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

// Fetch available tenders for project creation
async function fetchAvailableTenders(): Promise<Tender[]> {
  const data = await api.getAvailableTenders();
  return (data.tenders as Tender[]) || [];
}

export function useAvailableTenders(enabled = true) {
  return useQuery({
    queryKey: ["availableTenders"],
    queryFn: fetchAvailableTenders,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });
}

// Get lead company details
async function fetchCompanyById(
  companyId: string,
): Promise<CompanyRecord | null> {
  try {
    const data = await api.getCompany(companyId);
    return data.company;
  } catch {
    return null;
  }
}

export function useCompanyById(companyId: string | null) {
  return useQuery({
    queryKey: ["company", companyId],
    queryFn: () => fetchCompanyById(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
