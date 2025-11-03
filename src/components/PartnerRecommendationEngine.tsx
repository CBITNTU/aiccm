import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Company {
  id: string;
  company_name: string;
  key_capabilities: string;
  postcode: string;
  certifications: string;
  user_id: string;
}

interface RecommendationParams {
  userCompanyId: string;
  targetTenderId?: string;
}

export const usePartnerRecommendations = ({ userCompanyId, targetTenderId }: RecommendationParams) => {
  const [loading, setLoading] = useState(false);

  const generateRecommendations = async () => {
    if (!userCompanyId) return;

    setLoading(true);
    try {
      // Fetch user's company details
      const { data: userCompany, error: userCompanyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', userCompanyId)
        .single();

      if (userCompanyError || !userCompany) {
        throw new Error('Failed to fetch user company');
      }

      // Fetch all other active companies
      const { data: otherCompanies, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .eq('status', 'active')
        .neq('user_id', userCompany.user_id);

      if (companiesError) {
        throw new Error('Failed to fetch other companies');
      }

      // Generate recommendations based on complementary capabilities
      const recommendations = otherCompanies?.map(company => {
        const compatibility = calculateCompatibility(userCompany, company);
        return {
          company_id: userCompanyId,
          recommended_company_id: company.id,
          compatibility_score: compatibility.score,
          complementary_capabilities: compatibility.complementaryCapabilities,
          shared_locations: compatibility.sharedLocations,
          recommended_for_tender_id: targetTenderId || null,
          status: 'pending'
        };
      }).filter(rec => rec.compatibility_score > 30); // Only show decent matches

      // Insert recommendations (avoiding duplicates)
      if (recommendations && recommendations.length > 0) {
        const { error: insertError } = await supabase
          .from('partnership_recommendations')
          .upsert(recommendations, { 
            onConflict: 'company_id,recommended_company_id',
            ignoreDuplicates: false 
          });

        if (insertError) {
          console.error('Error inserting recommendations:', insertError);
        } else {
          toast.success(`Generated ${recommendations.length} partner recommendations`);
        }
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
      toast.error('Failed to generate partner recommendations');
    } finally {
      setLoading(false);
    }
  };

  return { generateRecommendations, loading };
};

// Algorithm to calculate compatibility between companies
const calculateCompatibility = (userCompany: Company, otherCompany: Company) => {
  let score = 0;
  const complementaryCapabilities: string[] = [];
  const sharedLocations: string[] = [];

  // Parse capabilities (split by common delimiters)
  const userCapabilities = parseCapabilities(userCompany.key_capabilities);
  const otherCapabilities = parseCapabilities(otherCompany.key_capabilities);
  
  // Location proximity (same postcode area = higher score)
  if (userCompany.postcode && otherCompany.postcode) {
    const userArea = userCompany.postcode.split(' ')[0];
    const otherArea = otherCompany.postcode.split(' ')[0];
    
    if (userArea === otherArea) {
      score += 30;
      sharedLocations.push(userArea);
    } else if (userArea.substring(0, 2) === otherArea.substring(0, 2)) {
      score += 15;
      sharedLocations.push(`${userArea.substring(0, 2)} area`);
    }
  }

  // Complementary capabilities (different but compatible skills)
  const complementaryKeywords = {
    'groundwork': ['structural', 'concrete', 'foundations'],
    'electrical': ['mechanical', 'plumbing', 'hvac'],
    'roofing': ['waterproofing', 'insulation', 'cladding'],
    'demolition': ['waste management', 'site clearance', 'excavation'],
    'joinery': ['glazing', 'flooring', 'finishing'],
    'steel work': ['welding', 'fabrication', 'structural'],
    'project management': ['site supervision', 'health and safety', 'quality control']
  };

  userCapabilities.forEach(userCap => {
    const userCapLower = userCap.toLowerCase();
    
    // Check for direct complementary matches
    Object.entries(complementaryKeywords).forEach(([key, complements]) => {
      if (userCapLower.includes(key)) {
        complements.forEach(complement => {
          if (otherCapabilities.some(otherCap => 
            otherCap.toLowerCase().includes(complement) && 
            !userCapabilities.some(uc => uc.toLowerCase().includes(complement))
          )) {
            score += 25;
            if (!complementaryCapabilities.includes(complement)) {
              complementaryCapabilities.push(complement);
            }
          }
        });
      }
    });
  });

  // Avoid too much overlap (companies shouldn't be too similar)
  const overlapCount = userCapabilities.filter(userCap =>
    otherCapabilities.some(otherCap => 
      userCap.toLowerCase() === otherCap.toLowerCase()
    )
  ).length;

  if (overlapCount > userCapabilities.length * 0.7) {
    score -= 20; // Reduce score for too much overlap
  }

  // Certification complementarity
  if (userCompany.certifications && otherCompany.certifications) {
    const userCerts = parseCapabilities(userCompany.certifications);
    const otherCerts = parseCapabilities(otherCompany.certifications);
    
    const uniqueCerts = otherCerts.filter(cert => 
      !userCerts.some(userCert => userCert.toLowerCase().includes(cert.toLowerCase()))
    );
    
    score += Math.min(uniqueCerts.length * 10, 30);
  }

  return {
    score: Math.min(Math.max(score, 0), 100), // Clamp between 0-100
    complementaryCapabilities,
    sharedLocations
  };
};

// Helper to parse capabilities from text
const parseCapabilities = (text: string | null): string[] => {
  if (!text) return [];
  
  return text
    .split(/[,;.\n]/)
    .map(item => item.trim())
    .filter(item => item.length > 2)
    .slice(0, 10); // Limit to avoid too many items
};