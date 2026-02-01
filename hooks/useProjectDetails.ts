"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import type { Project, GapAnalysis, TeamAnalysis, RecommendedPartner } from "./useProjects";

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
  companies: {
    id: string;
    company_name: string;
    key_capabilities?: string | null;
    postcode?: string | null;
    location?: string | null;
    contact_email?: string | null;
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
}

async function fetchProjectDetails(projectId: string): Promise<ProjectDetails> {
  const supabase = createClient();

  // Fetch project details
  const { data: projectData, error: projectError } = await supabase
    .from("virtual_organizations")
    .select(
      `
      *,
      tenders:target_tender_id (*)
    `
    )
    .eq("id", projectId)
    .single();

  if (projectError) {
    throw new Error(projectError.message);
  }

  // Fetch team members
  const { data: membersData, error: membersError } = await supabase
    .from("vo_members")
    .select(
      `
      *,
      companies:company_id (*)
    `
    )
    .eq("vo_id", projectId);

  if (membersError) {
    throw new Error(membersError.message);
  }

  const project = projectData as unknown as Project;
  const tender = project.tenders as unknown as Tender | null;
  const teamMembers = (membersData as unknown as TeamMember[]) || [];

  // When project has a tender and lead company, fetch tender match for "single company" gap display
  let tenderMatchResult: TenderMatchResult | null = null;
  if (project.lead_company_id && project.target_tender_id) {
    const { data: matchRow } = await supabase
      .from("matching_results")
      .select("id, overall_score, capability_score, experience_score, location_score, certification_score, match_reasons, ai_analysis")
      .eq("company_id", project.lead_company_id)
      .eq("tender_id", project.target_tender_id)
      .maybeSingle();
    if (matchRow) {
      tenderMatchResult = matchRow as unknown as TenderMatchResult;
    }
  }

  return {
    project,
    tender,
    teamMembers,
    gapAnalysis: project.gap_analysis || null,
    teamAnalysis: project.team_analysis || null,
    recommendedPartners: project.recommended_partners || [],
    tenderMatchResult,
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
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tenders")
    .select("id, title, buyer, deadline")
    .in("status", ["open", "closing_soon"])
    .order("deadline", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return (data as Tender[]) || [];
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
type Company = Database["public"]["Tables"]["companies"]["Row"];

async function fetchCompanyById(companyId: string): Promise<Company | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(error.message);
  }

  return data;
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
