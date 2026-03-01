import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
  sanitizeLikeParam,
} from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");
    const bookmarked = url.searchParams.get("bookmarked");
    const tenderStatus = url.searchParams.get("tenderStatus") || "active";
    const keyword = url.searchParams.get("keyword") || "";
    const minScore = url.searchParams.get("minScore");
    const maxScore = url.searchParams.get("maxScore");
    const showApplied = url.searchParams.get("showApplied") || "all";
    const quickFilter = url.searchParams.get("quickFilter") || "";
    const sortBy = url.searchParams.get("sortBy") || "overall_score";
    const sortDirection = url.searchParams.get("sortDirection") || "desc";
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25");

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize - 1;

    const supabase = createAdminClient();

    let query = supabase
      .from("matching_results")
      .select(
        `
        *,
        tenders!inner (
          title,
          buyer,
          description,
          location,
          deadline,
          budget_min,
          budget_max,
          status
        )
      `,
        { count: "exact" },
      );

    // Tender status filter (default: exclude closed)
    if (tenderStatus === "active") {
      query = query.not("tenders.status", "eq", "closed");
    } else if (tenderStatus !== "all") {
      query = query.eq("tenders.status", tenderStatus);
    }

    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        throw new AuthError("No access to this company");
      }
      query = query.eq("company_id", companyId);
    }

    if (bookmarked === "true") {
      query = query.eq("is_bookmarked", true);
    }

    // Keyword search across tender fields
    const safeKeyword = sanitizeLikeParam(keyword);
    if (safeKeyword) {
      query = query.or(
        `title.ilike.%${safeKeyword}%,description.ilike.%${safeKeyword}%,buyer.ilike.%${safeKeyword}%,location.ilike.%${safeKeyword}%`,
        { referencedTable: "tenders" },
      );
    }

    // Score range filters
    if (minScore) {
      query = query.gte("overall_score", parseFloat(minScore));
    }
    if (maxScore) {
      query = query.lte("overall_score", parseFloat(maxScore));
    }

    // Applied/bookmarked filter
    if (showApplied === "applied") {
      query = query.eq("is_applied", true);
    } else if (showApplied === "not_applied") {
      query = query.eq("is_applied", false);
    } else if (showApplied === "bookmarked") {
      query = query.eq("is_bookmarked", true);
    }

    // Quick filters
    if (quickFilter === "high_score") {
      query = query.gte("overall_score", 80);
    } else if (quickFilter === "urgent") {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const today = new Date().toISOString();
      query = query
        .gte("tenders.deadline", today)
        .lte("tenders.deadline", sevenDaysFromNow.toISOString());
    } else if (quickFilter === "high_value") {
      query = query.or(
        `budget_max.gte.1000000,budget_min.gte.1000000`,
        { referencedTable: "tenders" },
      );
    }

    // Sorting
    const ascending = sortDirection === "asc";
    if (
      ["overall_score", "capability_score", "experience_score", "location_score", "certification_score", "created_at"].includes(sortBy)
    ) {
      query = query.order(sortBy, { ascending });
    } else if (sortBy === "deadline") {
      query = query.order("deadline", { ascending, referencedTable: "tenders" });
    } else if (sortBy === "budget") {
      query = query.order("budget_max", { ascending, referencedTable: "tenders" });
    } else {
      query = query.order("overall_score", { ascending: false });
    }

    query = query.range(startIndex, endIndex);

    const { data, error, count } = await query;
    if (error) throw error;

    return apiResponse({ results: data || [], totalCount: count || 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
