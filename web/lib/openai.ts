import { api } from '@/lib/api/client';

export interface CompanyAnalysis {
  competencies: string[];
  capabilities: string[];
  strengths: string[];
  certifications: string[];
  recommendations: string[];
  digitalMaturity: string;
  safetyRating: string;
  marketPosition: string;
}

export const analyzeCompanyProfile = async (
  companyData: {
    companyName: string;
    websiteUrl: string;
    description: string;
    keyCapabilities: string;
    certifications: string;
    equipment: string;
    pastProjects: string;
  }
): Promise<CompanyAnalysis> => {
  try {
    const result = await api.analyzeCompanyAI({
      companyName: companyData.companyName,
      websiteUrl: companyData.websiteUrl,
      description: companyData.description,
      keyCapabilities: companyData.keyCapabilities,
      certifications: companyData.certifications,
      equipment: companyData.equipment,
      pastProjects: companyData.pastProjects,
    });

    return result.analysis as CompanyAnalysis;
  } catch (error) {
    console.error('Analysis Error:', error);
    throw new Error('Failed to analyze company profile. Please try again.');
  }
};

export const setOpenAIKey = (apiKey: string): void => {
  // No longer needed - using platform key
};

export const hasOpenAIKey = (): boolean => {
  // Always return true since we use platform key
  return true;
};
