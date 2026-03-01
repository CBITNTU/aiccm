import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const taxonomyIds = url.searchParams.get("taxonomyIds");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "25");

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit - 1;

    // Filter by taxonomy IDs if provided
    let filteredCompanyIds: string[] | null = null;
    if (taxonomyIds) {
      const ids = taxonomyIds.split(",").filter(Boolean);
      if (ids.length > 0) {
        const { data: companyIds, error } = await supabase
          .from("company_taxonomies")
          .select("company_id")
          .in("taxonomy_id", ids);

        if (error) throw error;

        if (companyIds && companyIds.length > 0) {
          filteredCompanyIds = [
            ...new Set(companyIds.map((c) => c.company_id)),
          ];
        } else {
          return apiResponse({ companies: [], totalCount: 0, page, totalPages: 0 });
        }
      }
    }

    // Build query
    let query = supabase
      .from("companies")
      .select(
        `id, company_name, description, key_capabilities, postcode,
         certifications, equipment, past_projects, is_system_company,
         status, market_position, safety_rating, digital_maturity,
         ai_competencies, ai_capabilities, ai_analysis,
         created_at, updated_at, user_id`,
        { count: "exact" },
      )
      .eq("status", "active");

    if (filteredCompanyIds) {
      query = query.in("id", filteredCompanyIds);
    }

    const safeSearch = sanitizeLikeParam(search);
    if (safeSearch) {
      query = query.or(
        `company_name.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`,
      );
    }

    query = query.order("company_name").range(startIndex, endIndex);

    const { data, error, count } = await query;
    if (error) throw error;

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch taxonomies for all returned companies in one query
    const companyIds = (data || []).map((c) => c.id);
    let taxonomiesByCompany: Record<string, { id: string; name: string }[]> = {};

    if (companyIds.length > 0) {
      const { data: taxData } = await supabase
        .from("company_taxonomies")
        .select("company_id, taxonomy_id, taxonomies(id, name)")
        .in("company_id", companyIds);

      if (taxData) {
        taxonomiesByCompany = {};
        for (const ct of taxData) {
          const taxonomy = ct.taxonomies as { id: string; name: string } | null;
          if (!taxonomy?.name) continue;
          if (!taxonomiesByCompany[ct.company_id]) {
            taxonomiesByCompany[ct.company_id] = [];
          }
          taxonomiesByCompany[ct.company_id].push({
            id: taxonomy.id,
            name: taxonomy.name,
          });
        }
      }
    }

    return apiResponse({
      companies: data || [],
      taxonomiesByCompany,
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
