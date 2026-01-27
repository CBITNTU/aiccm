"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type ProjectStatus = "active" | "completed" | "archived";

interface Tender {
  id: string;
  title: string;
  buyer: string;
  deadline: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  lead_company_id: string;
  target_tender_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  gap_analysis: GapAnalysis | null;
  team_analysis: TeamAnalysis | null;
  recommended_partners: RecommendedPartner[] | null;
  tenders: Tender | null;
}

export interface GapAnalysis {
  type: "gap";
  requiredCompetencies: string[];
  companyCompetencies: string[];
  missingCompetencies: string[];
  coveragePercentage: number;
  readinessScore: number;
  risks: string[];
  recommendations?: string[];
  analyzedAt: string;
}

export interface TeamAnalysis {
  type: "team";
  requiredCompetencies: string[];
  companyCompetencies: string[];
  missingCompetencies: string[];
  coveragePercentage: number;
  readinessScore: number;
  risks: string[];
  recommendations?: string[];
  teamMembers: {
    companyName: string;
    contribution: string[];
  }[];
  analyzedAt: string;
}

export interface RecommendedPartner {
  id: string;
  company_name: string;
  key_capabilities: string;
  certifications: string;
  location: string;
  relevanceScore: number;
  matchingCompetencies: string[];
}

async function fetchProjects(
  companyId: string,
  filter: ProjectStatus
): Promise<Project[]> {
  const supabase = createClient();

  const statusesToQuery =
    filter === "active" ? ["draft", "active"] : [filter];

  const { data, error } = await supabase
    .from("virtual_organizations")
    .select(
      `
      *,
      tenders:target_tender_id (
        id,
        title,
        buyer,
        deadline
      )
    `
    )
    .eq("lead_company_id", companyId)
    .in("status", statusesToQuery)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as Project[]) || [];
}

export function useProjects(companyId: string | null, filter: ProjectStatus) {
  return useQuery({
    queryKey: ["projects", companyId, filter],
    queryFn: () => fetchProjects(companyId!, filter),
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

// Hook to get user's companies (owned + member of)
type Company = Database["public"]["Tables"]["companies"]["Row"];

async function fetchUserCompanies(userId: string): Promise<Company[]> {
  const supabase = createClient();

  // Fetch companies owned by the user
  const { data: ownedCompanies, error: ownedError } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (ownedError) {
    throw new Error(ownedError.message);
  }

  // Fetch companies where user is an approved member
  const { data: memberCompanies, error: memberError } = await supabase
    .from("company_members")
    .select("company_id, companies(*)")
    .eq("user_id", userId)
    .eq("status", "approved");

  if (memberError) {
    throw new Error(memberError.message);
  }

  // Combine and deduplicate (in case user owns a company they're also a member of)
  const ownedIds = new Set((ownedCompanies || []).map((c) => c.id));
  const memberOnly = (memberCompanies || [])
    .map((m) => m.companies as unknown as Company)
    .filter((c): c is Company => c !== null && !ownedIds.has(c.id));

  // Return owned companies first, then member companies
  return [...(ownedCompanies || []), ...memberOnly];
}

export function useUserCompanies(userId: string | null) {
  return useQuery({
    queryKey: ["userCompanies", userId],
    queryFn: () => fetchUserCompanies(userId!),
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });
}
