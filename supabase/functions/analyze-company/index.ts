import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { companyId } = await req.json();
    
    if (!companyId) {
      throw new Error('Company ID is required');
    }

    // Fetch company data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      throw new Error('Company not found');
    }

    // Enhanced analysis prompt for better capability extraction
    const analysisPrompt = `
    Analyze the following construction company and provide detailed ratings and insights:
    
    Company: ${company.company_name}
    Description: ${company.description || 'N/A'}
    Key Capabilities: ${company.key_capabilities || 'N/A'}
    Equipment: ${company.equipment || 'N/A'}
    Certifications: ${company.certifications || 'N/A'}
    Past Projects: ${company.past_projects || 'N/A'}
    Safety Rating: ${company.safety_rating || 'N/A'}
    Digital Maturity: ${company.digital_maturity || 'N/A'}
    
    Please provide ratings for these 6 criteria and extract key capabilities:
    1. Technical Expertise (based on capabilities, equipment, and past projects)
    2. Safety Standards (based on safety rating and certifications)
    3. Innovation & Technology (based on digital maturity and modern equipment)
    4. Project Experience (based on past projects and company maturity)
    5. Certifications & Compliance (based on certifications and industry standards)
    6. Market Reputation (based on overall company profile and achievements)
    
    Also extract the top 6-9 most relevant capabilities/specializations from the company data.
    
    Return ONLY a JSON object with this exact structure:
    {
      "technicalExpertise": 85,
      "safetyStandards": 92,
      "innovation": 78,
      "projectExperience": 88,
      "certifications": 90,
      "marketReputation": 82,
      "overallScore": 86,
      "analysis": "Brief 2-3 sentence analysis of the company's strengths and areas for improvement",
      "ai_capabilities": ["Concrete Construction", "Steel Fabrication", "Project Management", "Safety Compliance", "Green Building", "Heavy Equipment"]
    }
    `;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert construction industry analyst. Provide accurate, fair assessments based on available data.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const analysisContent = openaiData.choices[0]?.message?.content;
    
    if (!analysisContent) {
      throw new Error('No analysis content received from OpenAI');
    }

    let analysis;
    try {
      // Clean the response by removing markdown code blocks if present
      let cleanedContent = analysisContent.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/```\n?/, '').replace(/\n?```$/, '');
      }
      
      analysis = JSON.parse(cleanedContent);
      
      // Validate that we have all required fields
      const requiredFields = ['technicalExpertise', 'safetyStandards', 'innovation', 'projectExperience', 'certifications', 'marketReputation', 'overallScore', 'analysis'];
      const missingFields = requiredFields.filter(field => analysis[field] === undefined);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Ensure ai_capabilities is an array
      if (!analysis.ai_capabilities || !Array.isArray(analysis.ai_capabilities)) {
        analysis.ai_capabilities = [];
      }
      
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', analysisContent);
      console.error('Parse error:', parseError.message);
      // Fallback analysis if parsing fails
      analysis = {
        technicalExpertise: 75,
        safetyStandards: 75,
        innovation: 70,
        projectExperience: 75,
        certifications: 70,
        marketReputation: 75,
        overallScore: 73,
        analysis: "Analysis could not be completed due to data parsing issues. Please try again.",
        ai_capabilities: []
      };
    }

    // Save analysis results to database
    const { error: updateError } = await supabase
      .from('companies')
      .update({ ai_analysis: analysis })
      .eq('id', companyId);

    if (updateError) {
      console.error('Error saving analysis to database:', updateError);
      // Continue anyway - we'll still return the analysis even if saving fails
    }

    console.log('Company analysis completed and saved for:', company.company_name);

    return new Response(JSON.stringify({
      success: true,
      analysis
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-company:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});