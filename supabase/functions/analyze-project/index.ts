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
    console.log('=== analyze-project function START ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
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
    console.log('Request received:', { projectId, companyId, tenderId, memberCount: members?.length });

    // Get tender details
    const { data: tender, error: tenderError } = await supabaseClient
      .from('tenders')
      .select('*')
      .eq('id', tenderId)
      .single();

    if (tenderError) {
      console.error('Error fetching tender:', tenderError);
      throw tenderError;
    }

    // Get company details
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError) {
      console.error('Error fetching company:', companyError);
      throw companyError;
    }

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

    // Run AI analysis using OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured in environment');
      throw new Error('OpenAI API key not configured');
    }
    
    console.log('Starting AI analysis with OpenAI...');
    const analysis = await analyzeProjectMatch(
      openaiApiKey,
      tender,
      company,
      memberCompanies
    );

    // Get partner recommendations
    console.log('Getting partner recommendations for missing competencies:', analysis.missingCompetencies);
    const recommendations = await getPartnerRecommendations(
      supabaseClient,
      analysis.missingCompetencies,
      company.postcode || company.location,
      companyId
    );

    console.log('Analysis complete, returning results');
    return new Response(JSON.stringify({
      analysis,
      recommendedPartners: recommendations
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== FATAL ERROR in analyze-project ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', (error as Error).message);
    console.error('Error stack:', (error as Error).stack);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      type: error?.constructor?.name 
    }), {
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
You are an expert in tender analysis and team formation for construction and consulting projects. Carefully analyze this tender and the proposed team.

TENDER DETAILS:
- Title: ${tender.title}
- Description: ${tender.description || 'Not provided'}
- Requirements: ${tender.requirements || 'Not provided'}
- Standards Required: ${tender.standards_required || 'Not provided'}
- CPV Codes: ${tender.cpv_codes?.join(', ') || 'Not provided'}
- Capacity Required: ${tender.capacity_required || 'Not specified'}
- Budget: ${tender.budget_min && tender.budget_max ? `£${tender.budget_min} - £${tender.budget_max}` : 'Not specified'}
- Location: ${tender.location || 'Not specified'}

CURRENT TEAM MEMBERS:
${companiesDescription}

TASK:
1. Extract ALL required competencies from the tender (technical skills, certifications, equipment, capacity, experience)
2. List ALL competencies the current team collectively possesses
3. Identify MISSING competencies (what the team lacks to fully meet tender requirements)
4. Calculate coverage percentage: (team competencies / required competencies) * 100
5. Calculate readiness score considering: competency coverage, certifications, past experience, capacity, location match
6. Identify key risks (e.g., lack of certifications, insufficient capacity, missing specializations)

IMPORTANT: Be thorough in extracting tender requirements. Look for:
- Technical capabilities mentioned
- Required certifications and standards (ISO, etc.)
- Specific equipment or technology needs
- Experience requirements
- Capacity/volume requirements
- Geographic/location requirements

Respond ONLY with valid JSON (no markdown, no additional text):
{
  "requiredCompetencies": ["competency1", "competency2"],
  "companyCompetencies": ["competency1", "competency2"],
  "missingCompetencies": ["competency1", "competency2"],
  "coveragePercentage": number,
  "readinessScore": number,
  "risks": ["risk1", "risk2"]
}
`;

  try {
    console.log('Calling OpenAI API...');
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
            content: 'You are an expert in analyzing tenders and matching company competencies. Always respond with valid JSON only, no markdown formatting.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log('OpenAI response received, parsing...');

    // Remove markdown code blocks if present
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (parseError) {
    console.error('Failed to parse AI response:', parseError);
    throw new Error('Invalid response format from AI analysis');
  }
}

async function getPartnerRecommendations(
  supabaseClient: any,
  missingCompetencies: string[],
  location: string,
  excludeCompanyId: string
): Promise<any[]> {
  if (!missingCompetencies || missingCompetencies.length === 0) {
    console.log('No missing competencies, returning empty recommendations');
    return [];
  }

  console.log('Searching for partners with competencies:', missingCompetencies);

  // Get all active companies except the current one
  const { data: companies, error } = await supabaseClient
    .from('companies')
    .select('*')
    .eq('status', 'active')
    .neq('id', excludeCompanyId)
    .limit(50);

  if (error || !companies) {
    console.error('Error fetching companies:', error);
    return [];
  }

  console.log(`Found ${companies.length} potential partner companies`);

  // Score each company based on missing competencies
  const scoredCompanies = companies.map((company: any) => {
    const capabilities = (company.key_capabilities?.toLowerCase() || '');
    const certifications = (company.certifications?.toLowerCase() || '');
    const pastProjects = (company.past_projects?.toLowerCase() || '');
    const equipment = (company.equipment?.toLowerCase() || '');
    const combinedText = `${capabilities} ${certifications} ${pastProjects} ${equipment}`;

    let matchCount = 0;
    const matchingCompetencies: string[] = [];

    missingCompetencies.forEach(comp => {
      const compLower = comp.toLowerCase();
      if (combinedText.includes(compLower) || 
          capabilities.includes(compLower) ||
          certifications.includes(compLower)) {
        matchCount++;
        matchingCompetencies.push(comp);
      }
    });

    const relevanceScore = missingCompetencies.length > 0
      ? Math.round((matchCount / missingCompetencies.length) * 100)
      : 0;

    return {
      id: company.id,
      company_name: company.company_name,
      key_capabilities: company.key_capabilities,
      certifications: company.certifications,
      location: company.postcode || 'N/A',
      relevanceScore,
      matchingCompetencies
    };
  });

  // Sort by relevance score and return top matches
  const topMatches = scoredCompanies
    .filter((c: any) => c.relevanceScore > 0)
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);

  console.log(`Returning ${topMatches.length} recommended partners`);

  return topMatches;
}
