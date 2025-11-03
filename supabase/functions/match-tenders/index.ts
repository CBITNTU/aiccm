import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyData {
  id: string;
  company_name: string;
  description: string | null;
  key_capabilities: string | null;
  location: string | null;
  postcode: string | null;
  past_projects: string | null;
  certifications: string | null;
  equipment: string | null;
  safety_rating: string | null;
  digital_maturity: string | null;
}

interface TenderData {
  id: string;
  title: string;
  description: string | null;
  buyer: string;
  location: string | null;
  budget_min: number | null;
  budget_max: number | null;
  deadline: string | null;
  cpv_codes: string[] | null;
  requirements: any;
  contact_info: any;
}

interface AnalysisResult {
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Get current user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired session. Please sign in again.' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Starting tender matching for user:', user.id);

    // Get companyId from request body if provided
    const requestBody = await req.json().catch(() => ({}));
    const targetCompanyId = requestBody.companyId;

    let company;
    
    if (targetCompanyId) {
      // Use specific company if provided
      const { data: specificCompany, error: specificCompanyError } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('id', targetCompanyId)
        .eq('user_id', user.id) // Ensure user owns this company
        .eq('status', 'active')
        .single();

      if (specificCompanyError || !specificCompany) {
        throw new Error(`Company not found or access denied: ${targetCompanyId}`);
      }
      
      company = specificCompany;
    } else {
      // Get user's first active company if no specific company provided
      const { data: companies, error: companyError } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);

      if (companyError || !companies || companies.length === 0) {
        throw new Error('No active company found for user');
      }

      company = companies[0];
    }

    const companyData = company as CompanyData;
    console.log('Found company:', companyData.company_name);

    // Get open tenders that haven't been analyzed for this company recently (within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentMatches } = await supabaseClient
      .from('matching_results')
      .select('tender_id')
      .eq('company_id', companyData.id)
      .gte('updated_at', sevenDaysAgo.toISOString());

    const recentlyAnalyzedTenderIds = recentMatches?.map(m => m.tender_id) || [];

    let tendersQuery = supabaseClient
      .from('tenders')
      .select('*')
      .in('status', ['open', 'closing_soon', 'framework']); // Analyze all active tenders

    // Only skip recently analyzed tenders (within 7 days)
    if (recentlyAnalyzedTenderIds.length > 0) {
      tendersQuery = tendersQuery.not('id', 'in', `(${recentlyAnalyzedTenderIds.map(id => `"${id}"`).join(',')})`);
    }

    const { data: tenders, error: tendersError } = await tendersQuery;

    if (tendersError) {
      throw new Error(`Failed to fetch tenders: ${tendersError.message}`);
    }

    if (!tenders || tenders.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'All tenders are up to date - no new tenders to analyze',
        analyzed_count: 0,
        up_to_date: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${tenders.length} tenders to analyze`);

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const results = [];

    // Analyze each tender
    for (const tender of tenders as TenderData[]) {
      try {
        console.log(`Analyzing tender: ${tender.title}`);
        
        const analysis = await analyzeTenderMatch(openAIApiKey, companyData, tender);
        
        // Save to database using upsert to handle duplicates
        const { error: insertError } = await supabaseClient
          .from('matching_results')
          .upsert({
            company_id: companyData.id,
            tender_id: tender.id,
            overall_score: analysis.overall_score,
            capability_score: analysis.capability_score,
            experience_score: analysis.experience_score,
            location_score: analysis.location_score,
            certification_score: analysis.certification_score,
            match_reasons: analysis.match_reasons,
            improvement_suggestions: analysis.improvement_suggestions,
            ai_analysis: analysis.ai_analysis,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'company_id,tender_id'
          });

        if (insertError) {
          console.error('Failed to save analysis:', insertError);
        } else {
          results.push({
            tender_id: tender.id,
            tender_title: tender.title,
            overall_score: analysis.overall_score,
          });
        }
      } catch (error) {
        console.error(`Failed to analyze tender ${tender.id}:`, error);
      }
    }

    return new Response(JSON.stringify({ 
      message: 'Tender analysis completed',
      analyzed_count: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in match-tenders function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzeTenderMatch(
  apiKey: string, 
  company: CompanyData, 
  tender: TenderData
): Promise<AnalysisResult> {
  const prompt = `
You are an expert in construction tender matching. Analyze how well this company matches this tender opportunity.

COMPANY PROFILE:
- Name: ${company.company_name}
- Description: ${company.description || 'Not provided'}
- Key Capabilities: ${company.key_capabilities || 'Not provided'}
- Location: ${company.postcode || company.location || 'Not provided'}
- Past Projects: ${company.past_projects || 'Not provided'}
- Certifications: ${company.certifications || 'Not provided'}
- Equipment: ${company.equipment || 'Not provided'}
- Safety Rating: ${company.safety_rating || 'Not provided'}
- Digital Maturity: ${company.digital_maturity || 'Not provided'}

TENDER OPPORTUNITY:
- Title: ${tender.title}
- Description: ${tender.description || 'Not provided'}
- Buyer: ${tender.buyer}
- Location: ${tender.location || 'Not provided'}
- Budget: ${tender.budget_min && tender.budget_max ? `£${tender.budget_min} - £${tender.budget_max}` : 'Not specified'}
- Deadline: ${tender.deadline || 'Not specified'}
- CPV Codes: ${tender.cpv_codes?.join(', ') || 'Not provided'}
- Requirements: ${JSON.stringify(tender.requirements) || 'Not provided'}

Please provide a detailed analysis with scores (0-100) for:
1. Overall Match Score
2. Capability Match Score  
3. Experience Match Score
4. Location Match Score
5. Certification Match Score

Also provide:
- 3-5 key match reasons
- 3-5 improvement suggestions
- A summary of strengths and weaknesses

Respond in valid JSON format only:
{
  "overall_score": number,
  "capability_score": number,
  "experience_score": number,
  "location_score": number,
  "certification_score": number,
  "match_reasons": ["reason1", "reason2", ...],
  "improvement_suggestions": ["suggestion1", "suggestion2", ...],
  "ai_analysis": {
    "summary": "Brief summary of the match",
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "recommendations": ["rec1", "rec2", ...]
  }
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
          content: 'You are a construction industry expert specializing in tender matching analysis. Always respond with valid JSON only.' 
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