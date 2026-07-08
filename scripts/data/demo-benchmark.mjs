// Builds the flat `DeepCompanyAnalysis` object stored in companies.ai_analysis
// and rendered by components/directory/CompanyDetailView.tsx (Performance
// Benchmark: overallScore, radar sub-scores, Executive Summary, SWOT, etc.).
//
// Scores are derived deterministically from the company id (FNV-1a hash) so the
// same company always gets the same benchmark — the seeder's INSERT and its
// refresh UPDATE produce identical JSON, keeping the seed idempotent.

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const BENCHMARK_DIMENSIONS = [
  "technicalExpertise",
  "safetyStandards",
  "innovation",
  "projectExperience",
  "certifications",
  "marketReputation",
  "financialHealth",
  "operationalCapacity",
];

// 8 sub-scores in the realistic 72–93 band + a rounded-average overallScore.
function performanceBenchmark(id) {
  const pb = {};
  for (const dim of BENCHMARK_DIMENSIONS) {
    pb[dim] = 72 + (hashSeed(`${id}:${dim}`) % 22);
  }
  const vals = BENCHMARK_DIMENSIONS.map((d) => pb[d]);
  pb.overallScore = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return pb;
}

export function buildAiAnalysis(c) {
  return {
    companyInfo: {
      description: c.description,
      key_capabilities: c.keyCapabilities,
      equipment: c.equipment,
      certifications: c.certifications,
      past_projects: c.pastProjects,
      contact_person: c.contactPerson,
      contact_email: c.contactEmail,
      contact_phone: c.contactPhone,
      postcode: c.postcode,
    },
    performanceBenchmark: performanceBenchmark(c.id),
    coreCompetencies: c.aiCompetencies,
    digitalMaturity: c.digitalMaturity,
    safetyRating: c.safetyRating,
    marketPosition: c.marketPosition,
    businessInsights: c.aiRecommendations,
    competitivePositioning: `公司在所属细分市场处于${c.marketPosition}地位，凭借核心技术与丰富的项目经验建立了稳固的竞争优势。`,
    swotSummary: {
      strengths: c.aiStrengths,
      weaknesses: ["全国品牌知名度仍有提升空间", "部分高端环节依赖外部合作"],
      opportunities: c.aiRecommendations,
      threats: ["行业竞争加剧与价格压力", "上游原材料及供应链价格波动"],
    },
    executiveSummary: c.aiSummary,
  };
}
