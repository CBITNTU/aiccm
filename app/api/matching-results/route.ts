import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { matchingResults, tenders } from "@/lib/db/schema/app";
import { eq, and, or, ne, ilike, gte, lte, asc, desc, count, SQL } from "drizzle-orm";

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

    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions: SQL[] = [];

    // Tender status filter
    if (tenderStatus === "active") {
      conditions.push(ne(tenders.status, "closed"));
    } else if (tenderStatus !== "all") {
      conditions.push(eq(tenders.status, tenderStatus));
    }

    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        throw new AuthError("No access to this company");
      }
      conditions.push(eq(matchingResults.companyId, companyId));
    }

    if (bookmarked === "true") {
      conditions.push(eq(matchingResults.isBookmarked, true));
    }

    // Keyword search across tender fields
    const safeKeyword = sanitizeLikeParam(keyword);
    if (safeKeyword) {
      conditions.push(
        or(
          ilike(tenders.title, `%${safeKeyword}%`),
          ilike(tenders.description, `%${safeKeyword}%`),
          ilike(tenders.buyer, `%${safeKeyword}%`),
          ilike(tenders.location, `%${safeKeyword}%`),
        )!,
      );
    }

    // Score range filters
    if (minScore) {
      conditions.push(gte(matchingResults.overallScore, parseFloat(minScore)));
    }
    if (maxScore) {
      conditions.push(lte(matchingResults.overallScore, parseFloat(maxScore)));
    }

    // Applied/bookmarked filter
    if (showApplied === "applied") {
      conditions.push(eq(matchingResults.isApplied, true));
    } else if (showApplied === "not_applied") {
      conditions.push(eq(matchingResults.isApplied, false));
    } else if (showApplied === "bookmarked") {
      conditions.push(eq(matchingResults.isBookmarked, true));
    }

    // Quick filters
    if (quickFilter === "high_score") {
      conditions.push(gte(matchingResults.overallScore, 80));
    } else if (quickFilter === "urgent") {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      conditions.push(gte(tenders.deadline, new Date()));
      conditions.push(lte(tenders.deadline, sevenDaysFromNow));
    } else if (quickFilter === "high_value") {
      conditions.push(
        or(
          gte(tenders.budgetMax, 1000000),
          gte(tenders.budgetMin, 1000000),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort
    const sortFn = sortDirection === "asc" ? asc : desc;
    let orderByClause;
    switch (sortBy) {
      case "overall_score":
        orderByClause = sortFn(matchingResults.overallScore);
        break;
      case "capability_score":
        orderByClause = sortFn(matchingResults.capabilityScore);
        break;
      case "experience_score":
        orderByClause = sortFn(matchingResults.experienceScore);
        break;
      case "location_score":
        orderByClause = sortFn(matchingResults.locationScore);
        break;
      case "certification_score":
        orderByClause = sortFn(matchingResults.certificationScore);
        break;
      case "created_at":
        orderByClause = sortFn(matchingResults.createdAt);
        break;
      case "deadline":
        orderByClause = sortFn(tenders.deadline);
        break;
      case "budget":
        orderByClause = sortFn(tenders.budgetMax);
        break;
      default:
        orderByClause = desc(matchingResults.overallScore);
    }

    const baseQuery = db
      .select({
        match: matchingResults,
        tender: {
          title: tenders.title,
          buyer: tenders.buyer,
          description: tenders.description,
          location: tenders.location,
          deadline: tenders.deadline,
          budgetMin: tenders.budgetMin,
          budgetMax: tenders.budgetMax,
          status: tenders.status,
        },
      })
      .from(matchingResults)
      .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id));

    const [countResult, data] = await Promise.all([
      db
        .select({ count: count() })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .where(whereClause),
      baseQuery
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset),
    ]);

    // Format results to match old Supabase shape
    const results = data.map((row) => ({
      ...row.match,
      tenders: {
        title: row.tender.title,
        buyer: row.tender.buyer,
        description: row.tender.description,
        location: row.tender.location,
        deadline: row.tender.deadline,
        budget_min: row.tender.budgetMin,
        budget_max: row.tender.budgetMax,
        status: row.tender.status,
      },
    }));

    return apiResponse({ results, totalCount: countResult[0]?.count || 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
