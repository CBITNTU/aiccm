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
    const keyword = url.searchParams.get("keyword") || "";
    const location = url.searchParams.get("location") || "";
    const status = url.searchParams.get("status") || "";
    const budgetMin = url.searchParams.get("budgetMin");
    const budgetMax = url.searchParams.get("budgetMax");
    const dateFrom = url.searchParams.get("dateFrom") || "";
    const dateTo = url.searchParams.get("dateTo") || "";
    const taxonomyIds = url.searchParams.get("taxonomyIds");
    const source = url.searchParams.get("source") || "";
    const sortBy = url.searchParams.get("sortBy") || "deadline";
    const sortDirection = url.searchParams.get("sortDirection") || "asc";
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25");

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize - 1;

    // Filter by taxonomy IDs if provided
    let filteredTenderIds: string[] | null = null;
    if (taxonomyIds) {
      const ids = taxonomyIds.split(",").filter(Boolean);
      if (ids.length > 0) {
        const { data: tenderIds, error } = await supabase
          .from("tender_taxonomies")
          .select("tender_id")
          .in("taxonomy_id", ids);

        if (error) throw error;

        if (tenderIds && tenderIds.length > 0) {
          filteredTenderIds = [
            ...new Set(tenderIds.map((t) => t.tender_id)),
          ];
        } else {
          return apiResponse({ tenders: [], totalCount: 0, taxonomies: {} });
        }
      }
    }

    // Build query
    let query = supabase
      .from("tenders")
      .select("*", { count: "exact" });

    // Default: exclude closed tenders unless a specific status is requested
    if (status) {
      query = query.eq("status", status);
    } else {
      query = query.neq("status", "closed");
    }

    if (filteredTenderIds) {
      query = query.in("id", filteredTenderIds);
    }

    const safeKeyword = sanitizeLikeParam(keyword);
    if (safeKeyword) {
      query = query.or(
        `title.ilike.%${safeKeyword}%,description.ilike.%${safeKeyword}%,buyer.ilike.%${safeKeyword}%,location.ilike.%${safeKeyword}%`,
      );
    }

    const safeLocation = sanitizeLikeParam(location);
    if (safeLocation) {
      query = query.ilike("location", `%${safeLocation}%`);
    }

    if (budgetMin) {
      query = query.gte("budget_min", parseFloat(budgetMin));
    }

    if (budgetMax) {
      query = query.lte("budget_max", parseFloat(budgetMax));
    }

    if (dateFrom.trim()) {
      query = query.gte("publication_date", dateFrom);
    }

    if (dateTo.trim()) {
      query = query.lte("publication_date", dateTo);
    }

    // Filter by source (derived from documents URL)
    if (source.trim()) {
      const domain =
        source === "ted"
          ? "ted.europa.eu"
          : source === "find-tender"
            ? "find-tender.service.gov.uk"
            : source === "contracts-finder"
              ? "contracts-finder.service.gov.uk"
              : null;
      if (domain) {
        // Match documents.specification_url OR documents.application_url (PostgREST uses * for wildcard)
        const pattern = `*${domain}*`;
        query = query.or(
          `documents->>specification_url.ilike.${pattern},documents->>application_url.ilike.${pattern}`,
        );
      }
    }

    query = query
      .order(sortBy, { ascending: sortDirection === "asc" })
      .range(startIndex, endIndex);

    const { data, error, count } = await query;
    if (error) throw error;

    const totalCount = count || 0;

    // Fetch taxonomies for returned tenders
    const tenderIds = (data || []).map((t) => t.id);
    const taxonomies: Record<string, { id: string; name: string }[]> = {};

    if (tenderIds.length > 0) {
      const { data: taxData } = await supabase
        .from("tender_taxonomies")
        .select("tender_id, taxonomy_id, taxonomies(id, name)")
        .in("tender_id", tenderIds);

      if (taxData) {
        for (const tt of taxData) {
          const taxonomy = tt.taxonomies as { id: string; name: string } | null;
          if (!taxonomy?.name) continue;
          if (!taxonomies[tt.tender_id]) {
            taxonomies[tt.tender_id] = [];
          }
          taxonomies[tt.tender_id].push({
            id: taxonomy.id,
            name: taxonomy.name,
          });
        }
      }
    }

    return apiResponse({ tenders: data || [], totalCount, taxonomies });
  } catch (error) {
    return handleApiError(error);
  }
}
