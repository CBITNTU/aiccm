import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
  ValidationError,
} from "@/lib/api/validation";
import { requireCompanyAccess } from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { curatedMatches, matchingResults, tenders } from "@/lib/db/schema/app";
import {
  activeCurationCondition,
  applyCuration,
  applyCurationToAnalysis,
  effectiveScoreSql,
  getCurationOverlay,
} from "@/lib/services/curatedMatches";
import { eq, and, or, ne, ilike, gte, lte, asc, desc, count, sql, SQL } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const url = new URL(request.url);
    // Mandatory: without it the query carries no company predicate at all and
    // every caller would see every company's results.
    const companyId = url.searchParams.get("companyId");
    if (!companyId) {
      throw new ValidationError("companyId is required");
    }

    const bookmarked = url.searchParams.get("bookmarked");
    const tenderStatus = url.searchParams.get("tenderStatus") || "active";
    const keyword = url.searchParams.get("keyword") || "";
    const minScore = url.searchParams.get("minScore");
    const maxScore = url.searchParams.get("maxScore");
    const showApplied = url.searchParams.get("showApplied") || "all";
    const quickFilter = url.searchParams.get("quickFilter") || "";
    const sortBy = url.searchParams.get("sortBy") || "overall_score";
    const sortDirection = url.searchParams.get("sortDirection") || "desc";
    const page = Math.max(parseInt(url.searchParams.get("page") || "1") || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "25") || 25, 1), 100);

    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions: SQL[] = [];

    // Tender status filter
    if (tenderStatus === "active") {
      conditions.push(ne(tenders.status, "closed"));
    } else if (tenderStatus !== "all") {
      conditions.push(eq(tenders.status, tenderStatus));
    }

    await requireCompanyAccess(user.id, companyId);
    conditions.push(eq(matchingResults.companyId, companyId));

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

    // Score range filters. These run on the curated effective score so a boosted
    // match doesn't drop out of the saved list the moment the user narrows the
    // range — /api/tenders/matches shows it at the curated value, and the two
    // views have to agree.
    if (minScore) {
      conditions.push(gte(effectiveScoreSql, parseFloat(minScore)));
    }
    if (maxScore) {
      conditions.push(lte(effectiveScoreSql, parseFloat(maxScore)));
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
      conditions.push(gte(effectiveScoreSql, 80));
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
        orderByClause = sortFn(effectiveScoreSql);
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
        // Undisclosed budgets (NULL) always sort to the bottom, regardless of direction.
        orderByClause =
          sortDirection === "asc"
            ? sql`${tenders.budgetMax} asc nulls last`
            : sql`${tenders.budgetMax} desc nulls last`;
        break;
      default:
        orderByClause = desc(effectiveScoreSql);
    }

    // Applied by the same join predicate everywhere: published, unexpired only.
    const curationJoin = and(
      eq(curatedMatches.companyId, matchingResults.companyId),
      eq(curatedMatches.tenderId, matchingResults.tenderId),
      activeCurationCondition(),
    )!;

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
          currency: tenders.currency,
          status: tenders.status,
        },
      })
      .from(matchingResults)
      .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
      .leftJoin(curatedMatches, curationJoin);

    const [countResult, data, curation] = await Promise.all([
      db
        .select({ count: count() })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .leftJoin(curatedMatches, curationJoin)
        .where(whereClause),
      baseQuery
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset),
      getCurationOverlay(companyId),
    ]);

    // Format results to match old Supabase shape
    const results = data.map((row) => {
      const c = curation.get(row.match.tenderId);
      // This route's records carry `overallScore` rather than `score`, so the
      // shared helper is fed a normalized view and its output mapped back.
      const curated = applyCuration(
        {
          score: row.match.overallScore ?? 0,
          capabilityScore: row.match.capabilityScore,
          experienceScore: row.match.experienceScore,
          locationScore: row.match.locationScore,
          certificationScore: row.match.certificationScore,
          matchReasons: row.match.matchReasons,
        },
        c,
      );
      return {
        ...row.match,
        overallScore: curated.score,
        capabilityScore: curated.capabilityScore ?? null,
        experienceScore: curated.experienceScore ?? null,
        locationScore: curated.locationScore ?? null,
        certificationScore: curated.certificationScore ?? null,
        matchReasons: curated.matchReasons ?? null,
        aiAnalysis: applyCurationToAnalysis(
          row.match.aiAnalysis,
          c,
          row.match.overallScore ?? 0,
        ),
        tenders: {
          title: row.tender.title,
          buyer: row.tender.buyer,
          description: row.tender.description,
          location: row.tender.location,
          deadline: row.tender.deadline,
          budgetMin: row.tender.budgetMin,
          budgetMax: row.tender.budgetMax,
          currency: row.tender.currency,
          status: row.tender.status,
        },
      };
    });

    return apiResponse({ results, totalCount: countResult[0]?.count || 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
