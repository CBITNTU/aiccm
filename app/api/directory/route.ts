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
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25")));

    const latParam = url.searchParams.get("lat");
    const lngParam = url.searchParams.get("lng");
    const radiusParam = url.searchParams.get("radiusMiles");
    const approvedOnly = url.searchParams.get("approvedOnly") === "true";
    const userLat = latParam ? parseFloat(latParam) : null;
    const userLng = lngParam ? parseFloat(lngParam) : null;
    const radiusMiles = radiusParam ? parseFloat(radiusParam) : null;
    const hasLocation = userLat != null && userLng != null && !isNaN(userLat) && !isNaN(userLng);

    // Pre-filter by taxonomy IDs if provided
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

    let companies: Record<string, unknown>[] = [];
    let totalCount: number;
    let totalPages: number;
    const distanceByCompany: Record<string, number> = {};

    if (hasLocation) {
      // Use PostGIS RPC — distance calculation, radius filter, sorting, and
      // pagination all happen in the database via spatial index.
      const safeSearch = sanitizeLikeParam(search) || null;

      const { data, error } = await supabase.rpc("nearby_companies", {
        user_lat: userLat,
        user_lng: userLng,
        radius_miles: radiusMiles,
        search_text: safeSearch,
        company_ids: filteredCompanyIds,
        page_num: page,
        page_size: limit,
        approved_only: approvedOnly,
      });

      if (error) throw error;

      const rows = (data || []) as Record<string, unknown>[];
      totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
      totalPages = Math.ceil(totalCount / limit);

      companies = rows;
      for (const row of rows) {
        if (row.distance_miles != null) {
          distanceByCompany[row.id as string] = row.distance_miles as number;
        }
      }
    } else {
      // Standard query — alphabetical, DB-paginated
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit - 1;

      let query = supabase
        .from("companies")
        .select(
          `id, company_name, description, key_capabilities, postcode,
           certifications, equipment, past_projects, is_system_company,
           is_approved, status, market_position, safety_rating, digital_maturity,
           ai_competencies, ai_capabilities, ai_analysis,
           latitude, longitude,
           created_at, updated_at, user_id`,
          { count: "exact" },
        )
        .eq("status", "active");

      if (approvedOnly) {
        query = query.eq("is_approved", true);
      }

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

      companies = data || [];
      totalCount = count || 0;
      totalPages = Math.ceil(totalCount / limit);
    }

    // Fetch taxonomies for returned companies
    const companyIds = companies.map((c) => c.id as string);
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
      companies,
      taxonomiesByCompany,
      ...(hasLocation && { distanceByCompany }),
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
