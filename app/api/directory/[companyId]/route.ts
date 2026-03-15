import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;
    const supabase = createAdminClient();

    // Fetch public company fields + user_id for ownership check (equipment, market_position, safety_rating removed from UI scope)
    const { data, error } = await supabase
      .from("companies")
      .select(
        `id, company_name, description, key_capabilities, postcode,
         certifications, past_projects, is_system_company,
         status, digital_maturity,
         ai_competencies, ai_capabilities, ai_analysis,
         created_at, updated_at, user_id, website_url`,
      )
      .eq("id", companyId)
      .or(`status.eq.active,user_id.eq.${user.id}`)
      .single();

    if (error) throw error;

    const isOwner = data.user_id === user.id;

    // Include contact fields only for the owner
    const { user_id: _uid, ...rest } = data;
    let companyData: Record<string, unknown> = { ...rest };
    if (isOwner) {
      const { data: fullData, error: fullError } = await supabase
        .from("companies")
        .select("contact_email, contact_phone, companies_house_number")
        .eq("id", companyId)
        .single();

      if (!fullError && fullData) {
        companyData = { ...companyData, ...fullData };
      }
    }

    // Fetch taxonomies for the company
    const { data: taxData } = await supabase
      .from("company_taxonomies")
      .select("taxonomy_id, taxonomies(id, name)")
      .eq("company_id", companyId);

    const taxonomies = (taxData || [])
      .map((ct) => ct.taxonomies as { id: string; name: string } | null)
      .filter((t): t is { id: string; name: string } => t !== null && !!t.name);

    // Fetch capabilities (selected) with category for tree display
    const { data: capData } = await supabase
      .from("company_capabilities")
      .select("company_capabilities_ref(id, name, category)")
      .eq("company_id", companyId);

    const capabilities = (capData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cc: any) => cc.company_capabilities_ref)
      .filter(
        (c): c is { id: string; name: string; category: string | null } =>
          c != null && !!c.name,
      );

    // Fetch markets (selected) with parent for tree display
    const { data: marketsData } = await supabase
      .from("company_markets")
      .select("markets(id, name, parent_id)")
      .eq("company_id", companyId);

    const marketsRaw = (marketsData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cm: any) => cm.markets)
      .filter(
        (m): m is { id: string; name: string; parent_id: string | null } =>
          m != null && !!m.name,
      );

    // Resolve market parent names for tree
    const _marketIds = marketsRaw.map((m) => m.id);
    const parentIds = [
      ...new Set(
        marketsRaw.map((m) => m.parent_id).filter((id): id is string => !!id),
      ),
    ];
    let parentNames: Record<string, string> = {};
    if (parentIds.length > 0) {
      const { data: parentRows } = await supabase
        .from("markets")
        .select("id, name")
        .in("id", parentIds);
      parentNames = Object.fromEntries(
        (parentRows || []).map((r) => [r.id, r.name]),
      );
    }
    const markets = marketsRaw.map((m) => ({
      id: m.id,
      name: m.name,
      parent_id: m.parent_id,
      parent_name: m.parent_id ? parentNames[m.parent_id] ?? null : null,
    }));

    // Fetch standards (selected) with parent for tree display
    const { data: standardsData } = await supabase
      .from("company_standards")
      .select("standards_ref(id, name, parent_id)")
      .eq("company_id", companyId);

    const standardsRaw = (standardsData || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cs: any) => cs.standards_ref)
      .filter(
        (s): s is { id: string; name: string; parent_id: string | null } =>
          s != null && !!s.name,
      );

    const stdParentIds = [
      ...new Set(
        standardsRaw
          .map((s) => s.parent_id)
          .filter((id): id is string => !!id),
      ),
    ];
    let stdParentNames: Record<string, string> = {};
    if (stdParentIds.length > 0) {
      const { data: stdParentRows } = await supabase
        .from("standards_ref")
        .select("id, name")
        .in("id", stdParentIds);
      stdParentNames = Object.fromEntries(
        (stdParentRows || []).map((r) => [r.id, r.name]),
      );
    }
    const standards = standardsRaw.map((s) => ({
      id: s.id,
      name: s.name,
      parent_id: s.parent_id,
      parent_name: s.parent_id ? stdParentNames[s.parent_id] ?? null : null,
    }));

    return apiResponse({
      company: companyData,
      isOwner,
      taxonomies,
      capabilities,
      markets,
      standards,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
