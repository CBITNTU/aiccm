import type { Database } from "@/lib/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];

export interface DashboardStats {
  totalTenders: number;
  matchingResults: number;
  companies: number;
  projects: number;
  recentMatches: MatchingResult[];
}

export interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: Record<string, unknown>;
  is_bookmarked: boolean;
  is_applied: boolean;
  created_at: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
  companies: {
    company_name: string;
  };
}

export interface CompanyAnalysis {
  performanceBenchmark: {
    technicalExpertise: number;
    safetyStandards: number;
    innovation: number;
    projectExperience: number;
    certifications: number;
    marketReputation: number;
    financialHealth: number;
    operationalCapacity: number;
    overallScore: number;
  };
  coreCompetencies: string[];
  digitalMaturity: string;
  safetyRating: string;
  marketPosition: string;
  businessInsights: string[];
  competitivePositioning: string;
  swotSummary: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  executiveSummary: string;
}
