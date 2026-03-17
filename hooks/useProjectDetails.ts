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
  buyerName?: string;
  location?: string;
  region?: string;
  deadline?: string;
  budgetMin?: number;
  budgetMax?: number;
  value?: number;
  description?: string;
  externalId?: string;
  referenceNumber?: string;
}

export interface TeamMember {
  id: string;
  voId: string;
  companyId: string;
  role: string;
  createdAt: string;
  joinedAt: string | null;
  invitationStatus?: string | null;
  invitationSentAt?: string | null;
  invitationRespondedAt?: string | null;
  invitationMessage?: string | null;
  companies: {
    id: string;
    companyName: string;
    keyCapabilities?: string | null;
    postcode?: string | null;
    location?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    certifications?: string | null;
    pastProjects?: string | null;
    description?: string | null;
  } | null;
}

/** Tender match result for lead company + tender (used when project has no partners). */
export interface TenderMatchResult {
  id: string;
  overallScore: number | null;
  capabilityScore: number | null;
  experienceScore: number | null;
  locationScore: number | null;
  certificationScore: number | null;
  matchReasons: string[] | null;
  aiAnalysis: { scoreExplanations?: Record<string, string> } | null;
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
    gapAnalysis: project.gapAnalysis || null,
    teamAnalysis: project.teamAnalysis || null,
    recommendedPartners: project.recommendedPartners || [],
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
