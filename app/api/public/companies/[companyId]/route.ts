import { NextRequest, NextResponse } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { handleApiError } from "@/lib/api/validation";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;

    if (!UUID_REGEX.test(companyId)) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("companies")
      .select(
        `id, company_name, description, key_capabilities, postcode,
         certifications, past_projects, is_system_company,
         status, digital_maturity,
         ai_competencies, ai_capabilities, ai_analysis,
         created_at, updated_at, website_url`,
      )
      .eq("id", companyId)
      .eq("status", "active")
      .not("user_id", "is", null)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { data: taxData } = await supabase
      .from("company_taxonomies")
      .select("taxonomy_id, taxonomies(id, name)")
      .eq("company_id", companyId);

    const taxonomies = (taxData || [])
      .map((ct) => ct.taxonomies as { id: string; name: string } | null)
      .filter((t): t is { id: string; name: string } => t !== null && !!t.name);

    return apiResponse({ company: data, taxonomies });
  } catch (error) {
    return handleApiError(error);
  }
}
