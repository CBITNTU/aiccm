import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching platform statistics...');

    // Create Supabase client with service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Fetch counts for all tables
    const [companiesRes, tendersRes, matchesRes, projectsRes] = await Promise.all([
      supabaseAdmin.from('companies').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('tenders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('matching_results').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('virtual_organizations').select('*', { count: 'exact', head: true })
    ]);

    console.log('Companies count:', companiesRes.count);
    console.log('Tenders count:', tendersRes.count);
    console.log('Matches count:', matchesRes.count);
    console.log('Projects count:', projectsRes.count);

    const stats = {
      companies: companiesRes.count || 0,
      tenders: tendersRes.count || 0,
      matches: matchesRes.count || 0,
      projects: projectsRes.count || 0
    };

    return new Response(
      JSON.stringify(stats),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
