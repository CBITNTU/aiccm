import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIND_TENDER_API_BASE = 'https://www.find-tender.service.gov.uk/api/1.0';

interface TenderData {
  id?: string;
  ocid?: string;
  reference_number: string;
  title: string;
  buyer: string;
  cpv_codes: string[];
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  location: string;
  deadline: string | null;
  status: string;
  publication_date: string;
  contact_info: any;
  requirements?: any;
  documents?: any;
  external_id?: string;
  source?: string;
}

// Transform OCDS release data to our tender format
function transformOCDSToTender(release: any, ocid: string): TenderData {
  const tender = release.tender || {};
  const parties = release.parties || [];
  const buyer = parties.find((p: any) => p.roles?.includes('buyer'));
  
  // Extract notice ID from release.id - it should be in format like "056752-2025"
  // If not available, try to construct from OCID
  const noticeId = release.id || ocid.replace('ocds-h6vhtk-', '').replace('-integration', '');
  
  // Convert budget values properly - handle decimals and ensure integers
  const convertBudget = (value: any): number | null => {
    if (!value || value === 0) return null;
    const numValue = Number(value);
    if (isNaN(numValue)) return null;
    // Convert to pence/cents (multiply by 100 to avoid decimal issues)
    return Math.floor(numValue * 100);
  };
  
  // Extract ALL CPV codes comprehensively from all items and classifications
  const cpvCodes: string[] = [];
  const cpvSet = new Set<string>(); // Use Set to avoid duplicates
  
  if (tender.items && Array.isArray(tender.items)) {
    tender.items.forEach((item: any) => {
      // Main classification
      if (item.classification && item.classification.id) {
        cpvSet.add(item.classification.id);
      }
      // Additional classifications (may contain more CPV codes)
      if (item.additionalClassifications && Array.isArray(item.additionalClassifications)) {
        item.additionalClassifications.forEach((ac: any) => {
          if (ac.id && (ac.scheme === 'CPV' || !ac.scheme)) {
            cpvSet.add(ac.id);
          }
        });
      }
    });
  }
  
  // Fallback to tender-level classification if no items
  if (cpvSet.size === 0 && tender.classification?.id) {
    cpvSet.add(tender.classification.id);
  }
  
  // Convert Set back to array
  cpvCodes.push(...Array.from(cpvSet));
  
  return {
    id: release.id || ocid,
    reference_number: release.id || ocid,
    title: tender.title || 'Untitled Tender',
    description: tender.description || release.description || '',
    buyer: buyer?.name || 'Unknown Buyer',
    location: tender.deliveryLocation?.description || 'United Kingdom',
    status: tender.status === 'active' ? 'open' : (tender.status || 'open'),
    publication_date: release.date || new Date().toISOString(),
    deadline: tender.tenderPeriod?.endDate || tender.enquiryPeriod?.endDate || null,
    budget_min: convertBudget(tender.value?.amount || tender.minValue?.amount),
    budget_max: convertBudget(tender.value?.amount || tender.maxValue?.amount),
    cpv_codes: cpvCodes,
    contact_info: {
      email: buyer?.contactPoint?.email || null,
      phone: buyer?.contactPoint?.telephone || null,
      organization: buyer?.name || 'Unknown Buyer'
    },
    source: "find_tender",
    external_id: noticeId, // Use properly formatted notice ID
    ocid: ocid // Keep OCID for reference
  };
}

async function fetchFromFindTenderAPI(searchTerm?: string, limit = 100, cursor?: string, isAdmin = false, filters?: any): Promise<any> {
  try {
    const params = new URLSearchParams();
    
    // For admins, allow unlimited fetching by using maximum API limit
    if (isAdmin) {
      params.append('limit', '100'); // API maximum
    } else {
      params.append('limit', Math.min(limit, 50).toString()); // Regular users get up to 50
    }
    
    params.append('stages', 'tender'); // Focus on active tenders
    
    if (cursor) {
      params.append('cursor', cursor);
    }
    
    // Apply date filters if provided
    if (filters?.dateFrom) {
      params.append('updatedFrom', new Date(filters.dateFrom).toISOString().slice(0, 19));
    } else {
      // Default to last 30 days if no date filter
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      params.append('updatedFrom', thirtyDaysAgo.toISOString().slice(0, 19));
    }
    
    if (filters?.dateTo) {
      params.append('updatedTo', new Date(filters.dateTo).toISOString().slice(0, 19));
    }
    
    const url = `${FIND_TENDER_API_BASE}/ocdsReleasePackages?${params.toString()}`;
    
    console.log('Fetching from Find a Tender API:', url, `(Admin: ${isAdmin})`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TenderMatchingService/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Find a Tender API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Received ${data.releases?.length || 0} releases from API (Admin: ${isAdmin})`);
    
    return data;
  } catch (error) {
    console.error('Error fetching from Find a Tender API:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user token and get user info
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired session. Please sign in again.' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Authenticated user:', user.id);

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const { searchTerm, limit = 100, cursor, adminImport = false, filters } = await req.json();

    // If this is an admin import request, check admin permissions
    if (adminImport && !isAdmin) {
      return new Response(JSON.stringify({ 
        error: 'Admin access required to import tenders',
        isAdmin: false 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch from real Find a Tender API with admin privileges and filters
    const ocdsData = await fetchFromFindTenderAPI(searchTerm, limit, cursor, isAdmin, filters);
    
    // Transform OCDS releases to our tender format
    let tenders = [];
    if (ocdsData.releases && ocdsData.releases.length > 0) {
      tenders = ocdsData.releases.map((release: any) => 
        transformOCDSToTender(release, release.ocid)
      );
    }
    
    // Apply additional filters to transformed data
    let filteredTenders = tenders;
    
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredTenders = tenders.filter((tender: TenderData) => 
        tender.title.toLowerCase().includes(searchLower) ||
        tender.description.toLowerCase().includes(searchLower) ||
        tender.buyer.toLowerCase().includes(searchLower) ||
        tender.location.toLowerCase().includes(searchLower)
      );
    }
    
    // Budget filter
    if (filters?.budgetMin || filters?.budgetMax) {
      filteredTenders = filteredTenders.filter((tender: TenderData) => {
        const tenderBudget = tender.budget_max || tender.budget_min || 0;
        if (filters.budgetMin && tenderBudget < filters.budgetMin) return false;
        if (filters.budgetMax && tenderBudget > filters.budgetMax) return false;
        return true;
      });
    }

    console.log(`Returning ${filteredTenders.length} tenders from Find a Tender API (admin: ${isAdmin}, total fetched: ${tenders.length})`);

    // If admin is importing, also save to database with duplicate prevention
    if (adminImport && isAdmin && filteredTenders.length > 0) {
      const tendersToInsert = filteredTenders.map((tender: TenderData) => ({
        reference_number: tender.reference_number,
        title: tender.title,
        buyer: tender.buyer,
        cpv_codes: tender.cpv_codes,
        description: tender.description,
        budget_min: tender.budget_min,
        budget_max: tender.budget_max,
        location: tender.location,
        deadline: tender.deadline,
        status: tender.status,
        publication_date: tender.publication_date,
        contact_info: tender.contact_info,
        requirements: {
          sectors: tender.cpv_codes,
          location: tender.location.split(',')[1]?.trim() || 'UK',
          deadline: tender.deadline
        },
        documents: {
          specification_url: `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`,
          application_url: `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`
        }
      }));

      // Check for existing tenders to avoid duplicates
      const { data: existingTenders } = await supabase
        .from('tenders')
        .select('reference_number')
        .in('reference_number', tendersToInsert.map((t: any) => t.reference_number));
      
      const existingRefs = new Set(existingTenders?.map((t: any) => t.reference_number) || []);
      const newTenders = tendersToInsert.filter((t: any) => !existingRefs.has(t.reference_number));
      
      if (newTenders.length > 0) {
        const { error: insertError } = await supabase
          .from('tenders')
          .upsert(newTenders, { onConflict: 'reference_number' });

        if (insertError) {
          console.error('Error importing tenders:', insertError);
        } else {
          console.log(`Successfully imported ${newTenders.length} new tenders to database (${tendersToInsert.length - newTenders.length} duplicates skipped)`);
        }
      } else {
        console.log('No new tenders to import - all were duplicates');
      }
    }

    // Extract pagination info from OCDS response
    const nextCursor = ocdsData.links?.next?.href ? 
      new URL(ocdsData.links.next.href).searchParams.get('cursor') : null;

    return new Response(JSON.stringify({
      tenders: filteredTenders,
      total: filteredTenders.length,
      totalFetched: tenders.length,
      hasMore: !!nextCursor && isAdmin, // Only admins can fetch more beyond first batch
      nextCursor: isAdmin ? nextCursor : null, // Only provide cursor to admins
      isAdmin,
      source: 'find_tender_api',
      duplicatesSkipped: adminImport ? (tenders.length - filteredTenders.length) : 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-uk-tenders:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({
      error: message,
      tenders: [],
      total: 0,
      page: 1,
      totalPages: 0,
      isAdmin: false,
      message: 'Unable to fetch tenders. Please try again later.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});