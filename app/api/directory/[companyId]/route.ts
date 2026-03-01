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

    // Fetch public company fields + user_id for ownership check
    const { data, error } = await supabase
      .from("companies")
      .select(
        `id, company_name, description, key_capabilities, postcode,
         certifications, equipment, past_projects, is_system_company,
         status, market_position, safety_rating, digital_maturity,
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

    return apiResponse({ company: companyData, isOwner, taxonomies });
  } catch (error) {
    return handleApiError(error);
  }
}
