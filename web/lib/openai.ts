import { createClient } from '@/lib/supabase/client';

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
  const supabase = createClient();

  try {
    const { data, error } = await supabase.functions.invoke('analyze-company-ai', {
      body: { companyData }
    });

    if (error) {
      console.error('Supabase function error:', error);
      throw new Error('Failed to analyze company profile. Please try again.');
    }

    return data.analysis;
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
