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

    const { projectId, tenderTitle, partnerIds } = await req.json();

    // Get project details
    const { data: project, error: projectError } = await supabaseClient
      .from('virtual_organizations')
      .select('*, companies:lead_company_id(*)')
      .eq('id', projectId)
      .single();

    if (projectError) throw projectError;

    // Get partner companies
    const { data: partners, error: partnersError } = await supabaseClient
      .from('companies')
      .select('*')
      .in('id', partnerIds);

    if (partnersError) throw partnersError;

    // Send invitation emails (placeholder - would need email service like Resend)
    // For now, we'll just log the invitations and create partnership messages
    
    const invitationPromises = partners.map(async (partner: any) => {
      // Create partnership message
      await supabaseClient
        .from('partnership_messages')
        .insert({
          from_company_id: project.lead_company_id,
          to_company_id: partner.id,
          subject: `Invitation to collaborate on ${tenderTitle}`,
          message: `
            You have been invited to join a consulting team for the tender "${tenderTitle}".
            
            Lead Company: ${project.companies?.company_name}
            Project: ${project.name}
            
            This collaboration opportunity has been identified based on your company's capabilities and expertise.
            
            Please review the project details and respond to this invitation.
          `,
          tender_id: project.target_tender_id
        });

      // In a production system, you would send actual emails here
      console.log(`Invitation sent to ${partner.company_name} (${partner.contact_email})`);
    });

    await Promise.all(invitationPromises);

    return new Response(JSON.stringify({
      success: true,
      invitationsSent: partners.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-project-invitations function:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
