import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompanyData {
  companyName: string;
  websiteUrl: string;
  description: string;
  keyCapabilities: string;
  certifications: string;
  equipment: string;
  pastProjects: string;
}

interface CompanyAnalysis {
  competencies: string[];
  capabilities: string[];
  strengths: string[];
  certifications: string[];
  recommendations: string[];
  digitalMaturity: string;
  safetyRating: string;
  marketPosition: string;
  suggestedTaxonomies?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyData, companyId } = await req.json() as { companyData: CompanyData; companyId?: string };

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch available taxonomies to help AI suggest appropriate ones
    const { data: taxonomies } = await supabase
      .from('taxonomies')
      .select('id, name, level')
      .order('level');

    const taxonomyList = taxonomies?.map(t => `${t.name} (Level ${t.level})`).join(', ') || '';

    const prompt = `Analyze this company profile and provide a comprehensive assessment based on the url and company profile:

Company Name: ${companyData.companyName}
Website: ${companyData.websiteUrl}
Description: ${companyData.description}
Key Capabilities: ${companyData.keyCapabilities}
Certifications: ${companyData.certifications}
Equipment: ${companyData.equipment}
Past Projects: ${companyData.pastProjects}

Available taxonomy categories: ${taxonomyList}

Please provide analysis in the following JSON format:
{
  "competencies": ["list of extracted competencies"],
  "capabilities": ["specific technical capabilities"],
  "strengths": ["key competitive strengths"],
  "certifications": ["standardized certification list"],
  "recommendations": ["improvement recommendations"],
  "digitalMaturity": "assessment of digital capabilities",
  "safetyRating": "safety and compliance assessment",
  "marketPosition": "market positioning analysis",
  "suggestedTaxonomies": ["array of taxonomy names from the available list that best match this company's profile"]
}

Focus on industry standards, UK compliance requirements, and tender readiness. For suggestedTaxonomies, select the most specific and relevant categories from the available taxonomy list.`;

    console.log('Sending request to OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert industry analyst specializing in UK market competency assessment and tender evaluation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    console.log('OpenAI response received:', content);

    // Parse JSON response with improved error handling
    let parsedResult: CompanyAnalysis;
    try {
      // First try direct parse
      parsedResult = JSON.parse(content);
    } catch (e) {
      try {
        // Try to extract JSON from markdown code blocks
        const codeBlockMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          parsedResult = JSON.parse(codeBlockMatch[1].trim());
        } else {
          // Fallback to regex extraction for any JSON object
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResult = JSON.parse(jsonMatch[0]);
          } else {
            // If no JSON found, create a default response
            console.warn('No JSON found in OpenAI response:', content);
            parsedResult = {
              competencies: ["General Construction"],
              capabilities: ["Basic Construction Services"],
              strengths: ["Experience in Construction"],
              certifications: [],
              recommendations: ["Consider obtaining relevant certifications"],
              digitalMaturity: "Requires assessment",
              safetyRating: "Requires assessment", 
              marketPosition: "Requires further analysis",
              suggestedTaxonomies: []
            };
          }
        }
      } catch (fallbackError) {
        console.error('Failed to parse OpenAI response:', content);
        throw new Error('Could not parse analysis response. Please try again.');
      }
    }

    // Auto-tag company with suggested taxonomies
    if (companyId && parsedResult.suggestedTaxonomies && parsedResult.suggestedTaxonomies.length > 0) {
      console.log('Auto-tagging company with taxonomies:', parsedResult.suggestedTaxonomies);
      
      // Find taxonomy IDs by name
      const taxonomyIds = taxonomies
        ?.filter(t => parsedResult.suggestedTaxonomies?.some(suggested => 
          t.name.toLowerCase().includes(suggested.toLowerCase()) || 
          suggested.toLowerCase().includes(t.name.toLowerCase())
        ))
        .map(t => t.id) || [];

      if (taxonomyIds.length > 0) {
        // Remove existing taxonomies first to avoid duplicates
        await supabase
          .from('company_taxonomies')
          .delete()
          .eq('company_id', companyId);

        // Insert new taxonomies
        const taxonomyInserts = taxonomyIds.map(taxId => ({
          company_id: companyId,
          taxonomy_id: taxId
        }));

        const { error: taxonomyError } = await supabase
          .from('company_taxonomies')
          .insert(taxonomyInserts);

        if (taxonomyError) {
          console.error('Error inserting taxonomies:', taxonomyError);
        } else {
          console.log(`Successfully tagged company with ${taxonomyIds.length} taxonomies`);
        }
      }
    }

    return new Response(
      JSON.stringify({ analysis: parsedResult }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in analyze-company-ai function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze company profile. Please try again.',
        details: message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
