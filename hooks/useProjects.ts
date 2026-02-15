"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
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
  filter: ProjectStatus,
): Promise<Project[]> {
  const data = await api.getProjects({ companyId, status: filter });
  return (data.projects as unknown as Project[]) || [];
}

export function useProjects(companyId: string | null, filter: ProjectStatus) {
  return useQuery({
    queryKey: queryKeys.projects(companyId!, filter),
    queryFn: () => fetchProjects(companyId!, filter),
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

// Hook to get user's companies (owned + member of)
type Company = Database["public"]["Tables"]["companies"]["Row"];

async function fetchUserCompanies(): Promise<Company[]> {
  const data = await api.getMyCompanies();
  return data.companies as unknown as Company[];
}

export function useUserCompanies(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.myCompanies(userId!),
    queryFn: () => fetchUserCompanies(),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
