import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { haversineDistanceMiles } from "@/lib/geocode";

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
    const userLat = latParam ? parseFloat(latParam) : null;
    const userLng = lngParam ? parseFloat(lngParam) : null;
    const radiusMiles = radiusParam ? parseFloat(radiusParam) : null;
    const hasLocation = userLat != null && userLng != null && !isNaN(userLat) && !isNaN(userLng);

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

    // Build query — include coordinates for distance calculation
    let query = supabase
      .from("companies")
      .select(
        `id, company_name, description, key_capabilities, postcode,
         certifications, equipment, past_projects, is_system_company,
         status, market_position, safety_rating, digital_maturity,
         ai_competencies, ai_capabilities, ai_analysis,
         latitude, longitude,
         created_at, updated_at, user_id`,
        { count: hasLocation ? undefined : "exact" },
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

    if (hasLocation) {
      // Fetch all matching companies for JS-side distance calculation
      query = query.order("company_name").limit(5000);
    } else {
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit - 1;
      query = query.order("company_name").range(startIndex, endIndex);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    let companies = data || [];
    let totalCount: number;
    let totalPages: number;
    const distanceByCompany: Record<string, number> = {};

    if (hasLocation) {
      // Compute distances
      type CompanyRow = (typeof companies)[number];
      const withDistance: { company: CompanyRow; distance: number | null }[] =
        companies.map((c) => ({
          company: c,
          distance: haversineDistanceMiles(
            c.latitude as number | null,
            c.longitude as number | null,
            userLat,
            userLng,
          ),
        }));

      // Filter by radius if set
      let filtered = withDistance;
      if (radiusMiles != null && !isNaN(radiusMiles)) {
        filtered = withDistance.filter(
          (item) => item.distance != null && item.distance <= radiusMiles,
        );
      }

      // Sort: closest first, nulls (no coordinates) last
      filtered.sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });

      totalCount = filtered.length;
      totalPages = Math.ceil(totalCount / limit);

      // Paginate in JS
      const startIndex = (page - 1) * limit;
      const pageSlice = filtered.slice(startIndex, startIndex + limit);

      companies = pageSlice.map((item) => item.company);
      for (const item of pageSlice) {
        if (item.distance != null) {
          distanceByCompany[item.company.id] =
            Math.round(item.distance * 10) / 10;
        }
      }
    } else {
      totalCount = count || 0;
      totalPages = Math.ceil(totalCount / limit);
    }

    // Fetch taxonomies for returned companies
    const companyIds = companies.map((c) => c.id);
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
