export type Company = import("@/lib/api/types").CompanyRecord;

export interface DashboardStats {
  totalTenders: number;
  matchingResults: number;
  companies: number;
  projects: number;
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

export interface RadarDatum {
  subject: string;
  A: number;
  fullMark: number;
}

/**
 * Radar series for `PerformanceBenchmarkCard`. Plots 6 of the 9 benchmark
 * dimensions (financialHealth and operationalCapacity are stored but not
 * charted). Shared so the dashboard and the admin pre-approval preview render
 * the identical chart.
 */
export function buildRadarData(
  analysis: CompanyAnalysis | null | undefined,
): RadarDatum[] {
  const benchmark = analysis?.performanceBenchmark;
  if (!benchmark) return [];
  return [
    { subject: "Technical Expertise", A: benchmark.technicalExpertise || 0, fullMark: 100 },
    { subject: "Safety Standards", A: benchmark.safetyStandards || 0, fullMark: 100 },
    { subject: "Innovation", A: benchmark.innovation || 0, fullMark: 100 },
    { subject: "Project Experience", A: benchmark.projectExperience || 0, fullMark: 100 },
    { subject: "Certifications", A: benchmark.certifications || 0, fullMark: 100 },
    { subject: "Market Reputation", A: benchmark.marketReputation || 0, fullMark: 100 },
  ];
}
