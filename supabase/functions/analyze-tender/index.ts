import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TenderData {
  title: string;
  description: string;
  buyer: string;
  cpv_codes?: string[];
  location?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenderData, tenderId } = await req.json() as { tenderData: TenderData; tenderId?: string };

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch available taxonomies
    const { data: taxonomies } = await supabase
      .from('taxonomies')
      .select('id, name, level')
      .order('level');

    const taxonomyList = taxonomies?.map(t => `${t.name} (Level ${t.level})`).join(', ') || '';

    const prompt = `Analyze this tender and identify the most relevant industry categories from the available taxonomy list:

Tender Title: ${tenderData.title}
Description: ${tenderData.description}
Buyer: ${tenderData.buyer}
${tenderData.cpv_codes ? `CPV Codes: ${tenderData.cpv_codes.join(', ')}` : ''}
${tenderData.location ? `Location: ${tenderData.location}` : ''}

Available taxonomy categories: ${taxonomyList}

Please analyze the tender and return ONLY a JSON array of the most relevant taxonomy names from the available list. Select 2-5 categories that best match this tender's scope and requirements.

Return format (must be valid JSON array):
["Category Name 1", "Category Name 2", "Category Name 3"]

Focus on the most specific and accurate categories that would help companies find this tender.`;

    console.log('Analyzing tender:', tenderData.title);

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
            content: 'You are an expert at analyzing tender documents and categorizing them. Return only valid JSON arrays of category names.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 500
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

    console.log('AI response:', content);

    let suggestedTaxonomies: string[] = [];
    try {
      const codeBlockMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        suggestedTaxonomies = JSON.parse(codeBlockMatch[1].trim());
      } else {
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          suggestedTaxonomies = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (e) {
      console.error('Failed to parse AI response:', content, e);
      suggestedTaxonomies = [];
    }

    // Auto-tag tender if tenderId provided
    if (tenderId && suggestedTaxonomies.length > 0) {
      console.log('Auto-tagging tender with taxonomies:', suggestedTaxonomies);
      
      const taxonomyIds = taxonomies
        ?.filter(t => suggestedTaxonomies.some(suggested => 
          t.name.toLowerCase().includes(suggested.toLowerCase()) || 
          suggested.toLowerCase().includes(t.name.toLowerCase())
        ))
        .map(t => t.id) || [];

      if (taxonomyIds.length > 0) {
        // Remove existing taxonomies
        await supabase
          .from('tender_taxonomies')
          .delete()
          .eq('tender_id', tenderId);

        // Insert new taxonomies
        const taxonomyInserts = taxonomyIds.map(taxId => ({
          tender_id: tenderId,
          taxonomy_id: taxId
        }));

        const { error: taxonomyError } = await supabase
          .from('tender_taxonomies')
          .insert(taxonomyInserts);

        if (taxonomyError) {
          console.error('Error inserting tender taxonomies:', taxonomyError);
        } else {
          console.log(`Successfully tagged tender with ${taxonomyIds.length} taxonomies`);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        suggestedTaxonomies,
        taxonomyCount: suggestedTaxonomies.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in analyze-tender function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze tender',
        details: message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
