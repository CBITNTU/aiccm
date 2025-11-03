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
      { global: { headers: { Authorization: authHeader } } }
    );

    const { projectId, companyId, tenderId, members } = await req.json();

    // Get tender
    const { data: tender, error: tenderError } = await supabaseClient
      .from('tenders')
      .select('*')
      .eq('id', tenderId)
      .single();

    if (tenderError) throw new Error(`Tender fetch failed: ${tenderError.message}`);

    // Get company
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError) throw new Error(`Company fetch failed: ${companyError.message}`);

    // Get member companies
    let memberCompanies = [];
    if (members?.length > 0) {
      const memberIds = members.map((m: any) => m.company_id);
      const { data } = await supabaseClient
        .from('companies')
        .select('*')
        .in('id', memberIds);
      memberCompanies = data || [];
    }

    // Call OpenAI
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OpenAI API key not configured');

    const allCompanies = [company, ...memberCompanies];
    const companiesText = allCompanies.map(c => 
      `Company: ${c.company_name}\nCapabilities: ${c.key_capabilities || 'N/A'}\nCertifications: ${c.certifications || 'N/A'}`
    ).join('\n\n');

    const prompt = `Analyze this tender and team:\n\nTENDER:\nTitle: ${tender.title}\nDescription: ${tender.description || 'N/A'}\nLocation: ${tender.location || 'N/A'}\n\nTEAM:\n${companiesText}\n\nProvide analysis as JSON with:\n- requiredCompetencies: array of strings\n- companyCompetencies: array of strings\n- missingCompetencies: array of strings\n- coveragePercentage: number (0-100)\n- readinessScore: number (0-100)\n- risks: array of strings\n\nRespond with valid JSON only, no markdown.`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a tender analysis expert. Respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`OpenAI API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(cleanContent);

    // Get partner recommendations
    const missingComps = analysis.missingCompetencies || [];
    let recommendations: any[] = [];

    if (missingComps.length > 0) {
      const { data: companies } = await supabaseClient
        .from('companies')
        .select('*')
        .eq('status', 'active')
        .neq('id', companyId)
        .limit(50);

      if (companies) {
        const scored = companies.map((c: any) => {
          const text = `${c.key_capabilities || ''} ${c.certifications || ''}`.toLowerCase();
          const matches = missingComps.filter((comp: string) => 
            text.includes(comp.toLowerCase())
          );
          return {
            id: c.id,
            company_name: c.company_name,
            key_capabilities: c.key_capabilities,
            certifications: c.certifications,
            location: c.postcode || 'N/A',
            relevanceScore: Math.round((matches.length / missingComps.length) * 100),
            matchingCompetencies: matches
          };
        });

        recommendations = scored
          .filter((c: any) => c.relevanceScore > 0)
          .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
          .slice(0, 10);
      }
    }

    return new Response(JSON.stringify({
      analysis,
      recommendedPartners: recommendations
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
