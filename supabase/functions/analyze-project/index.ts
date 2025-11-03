import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { projectId, companyId, tenderId, members } = await req.json();

    // Get tender details
    const { data: tender, error: tenderError } = await supabaseClient
      .from('tenders')
      .select('*')
      .eq('id', tenderId)
      .single();

    if (tenderError) throw tenderError;

    // Get company details
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError) throw companyError;

    // Get all member companies
    const memberCompanyIds = members?.map((m: any) => m.company_id) || [];
    let memberCompanies = [];
    
    if (memberCompanyIds.length > 0) {
      const { data: memberData, error: memberError } = await supabaseClient
        .from('companies')
        .select('*')
        .in('id', memberCompanyIds);
      
      if (!memberError) {
        memberCompanies = memberData || [];
      }
    }

    // Run AI analysis
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const analysis = await analyzeProjectMatch(
      openAIApiKey,
      tender,
      company,
      memberCompanies
    );

    // Get partner recommendations
    const recommendations = await getPartnerRecommendations(
      supabaseClient,
      analysis.missingCompetencies,
      company.postcode || company.location,
      companyId
    );

    return new Response(JSON.stringify({
      analysis,
      recommendedPartners: recommendations
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-project function:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzeProjectMatch(
  apiKey: string,
  tender: any,
  ownerCompany: any,
  memberCompanies: any[]
): Promise<any> {
  const allCompanies = [ownerCompany, ...memberCompanies];
  
  const companiesDescription = allCompanies.map(c => `
    Company: ${c.company_name}
    Capabilities: ${c.key_capabilities || 'Not specified'}
    Certifications: ${c.certifications || 'Not specified'}
    Past Projects: ${c.past_projects || 'Not specified'}
    Equipment: ${c.equipment || 'Not specified'}
  `).join('\n\n');

  const prompt = `
You are an expert in construction tender analysis and team formation. Analyze this tender and the proposed team.

TENDER DETAILS:
- Title: ${tender.title}
- Description: ${tender.description || 'Not provided'}
- Requirements: ${JSON.stringify(tender.requirements) || 'Not provided'}
- CPV Codes: ${tender.cpv_codes?.join(', ') || 'Not provided'}
- Budget: ${tender.budget_min && tender.budget_max ? `£${tender.budget_min} - £${tender.budget_max}` : 'Not specified'}

PROPOSED TEAM:
${companiesDescription}

Please provide a detailed analysis with:
1. Required competencies list (extract from tender requirements)
2. Current team competencies (what the team collectively has)
3. Missing competencies (gaps that need to be filled)
4. Coverage percentage (0-100)
5. Readiness score (0-100, overall bid readiness)
6. Key risks or concerns

Respond in valid JSON format only:
{
  "requiredCompetencies": ["competency1", "competency2", ...],
  "companyCompetencies": ["competency1", "competency2", ...],
  "missingCompetencies": ["competency1", "competency2", ...],
  "coveragePercentage": number,
  "readinessScore": number,
  "risks": ["risk1", "risk2", ...]
}
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a construction industry expert. Always respond with valid JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', content);
    throw new Error('Invalid response format from AI analysis');
  }
}

async function getPartnerRecommendations(
  supabaseClient: any,
  missingCompetencies: string[],
  location: string,
  excludeCompanyId: string
): Promise<any[]> {
  // Get all active companies except the current one
  const { data: companies, error } = await supabaseClient
    .from('companies')
    .select('*')
    .eq('status', 'active')
    .neq('id', excludeCompanyId)
    .limit(20);

  if (error || !companies) {
    console.error('Error fetching companies:', error);
    return [];
  }

  // Score each company based on missing competencies
  const scoredCompanies = companies.map((company: any) => {
    const capabilities = company.key_capabilities?.toLowerCase() || '';
    const certifications = company.certifications?.toLowerCase() || '';
    const combinedText = `${capabilities} ${certifications}`;

    let matchCount = 0;
    const matchingCompetencies: string[] = [];

    missingCompetencies.forEach(comp => {
      if (combinedText.includes(comp.toLowerCase())) {
        matchCount++;
        matchingCompetencies.push(comp);
      }
    });

    const relevanceScore = missingCompetencies.length > 0
      ? Math.round((matchCount / missingCompetencies.length) * 100)
      : 0;

    return {
      ...company,
      relevanceScore,
      matchingCompetencies
    };
  });

  // Sort by relevance score and return top matches
  return scoredCompanies
    .filter((c: any) => c.relevanceScore > 0)
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);
}
