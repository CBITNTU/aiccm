import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
  ValidationError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { matchingResults, tenders } from "@/lib/db/schema/app";
import { basicMatchTendersForCompany } from "@/lib/services/basicMatchingService";
import {
  eq,
  and,
  or,
  ne,
  ilike,
  gte,
  lte,
  asc,
  desc,
  count,
  inArray,
  SQL,
} from "drizzle-orm";
import type {
  UnifiedMatch,
  UnifiedMatchDeep,
  UnifiedMatchBasic,
  TenderMatchesResponse,
} from "@/lib/api/types";

/**
 * GET /api/tenders/matches
 *
 * Unified, server-side tender matches for a company. Merges deep matches
 * (matching_results, score 0-100) with the bounded semantic "basic" overlay,
 * interleaves them by effective score, filters out 0% matches in the DB/server,
 * and paginates server-side. Returns the page plus counts so the client never
 * has to fetch the whole match universe to display or count it.
 *
 * Scalability: the deep set can grow to thousands, the basic overlay is
 * structurally bounded (~250). We fetch at most `offset + pageSize` deep rows
 * (SQL ORDER BY ... LIMIT) and merge them with the full basic overlay. Because
 * basic items can only push a deep item to a HIGHER union rank (never lower),
 * the top `offset + pageSize` deep rows are a superset of every deep item that
 * can appear at/before union position `offset + pageSize` — so slicing the
 * requested page from that bounded merge is exact. Memory stays bounded.
 */
/**
 * The basic-match service returns rows from a raw `db.execute` query, so its
 * `deadline` may be a Date or a raw string (vs. drizzle's hydrated Date on the
 * deep side). Coerce safely; deadlines are optional, so invalid/empty -> null.
 */
function toEpochMs(value: unknown): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toIsoString(value: unknown): string | null {
  const ms = toEpochMs(value);
  return ms == null ? null : new Date(ms).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const url = new URL(request.url);

    const companyId = url.searchParams.get("companyId");
    if (!companyId) {
      throw new ValidationError("companyId is required");
    }

    const tenderStatus = url.searchParams.get("tenderStatus") || "active";
    const keyword = url.searchParams.get("keyword") || "";
    const minScore = parseInt(url.searchParams.get("minScore") || "0") || 0;
    const maxScore = parseInt(url.searchParams.get("maxScore") || "100") || 100;
    const showApplied = url.searchParams.get("showApplied") || "all";
    const quickFilter = url.searchParams.get("quickFilter") || "";
    const sortBy = url.searchParams.get("sortBy") || "overall_score";
    const sortDirection = url.searchParams.get("sortDirection") || "desc";
    const page = Math.max(parseInt(url.searchParams.get("page") || "1") || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(url.searchParams.get("pageSize") || "25") || 25, 1),
      100,
    );
    const offset = (page - 1) * pageSize;

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    // Fold the "hide 0% matches" rule (MIN_MATCH_SCORE = 1) and the user's
    // minScore filter into a single lower bound so 0% rows never surface.
    const effectiveMin = Math.max(minScore, 1);

    // ---- Deep side: filter conditions (mirrors /api/matching-results) -------
    const conditions: SQL[] = [eq(matchingResults.companyId, companyId)];

    if (tenderStatus === "active") {
      conditions.push(ne(tenders.status, "closed"));
    } else if (tenderStatus !== "all") {
      conditions.push(eq(tenders.status, tenderStatus));
    }

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

    conditions.push(gte(matchingResults.overallScore, effectiveMin));
    conditions.push(lte(matchingResults.overallScore, maxScore));

    if (showApplied === "applied") {
      conditions.push(eq(matchingResults.isApplied, true));
    } else if (showApplied === "not_applied") {
      conditions.push(eq(matchingResults.isApplied, false));
    } else if (showApplied === "bookmarked") {
      conditions.push(eq(matchingResults.isBookmarked, true));
    }

    if (quickFilter === "high_score") {
      conditions.push(gte(matchingResults.overallScore, 80));
    } else if (quickFilter === "urgent") {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      conditions.push(gte(tenders.deadline, new Date()));
      conditions.push(lte(tenders.deadline, sevenDaysFromNow));
    } else if (quickFilter === "high_value") {
      conditions.push(
        or(gte(tenders.budgetMax, 1000000), gte(tenders.budgetMin, 1000000))!,
      );
    }

    const deepWhere = and(...conditions);

    // Deep sort (mirrors /api/matching-results)
    const sortFn = sortDirection === "asc" ? asc : desc;
    let orderByClause;
    switch (sortBy) {
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
      case "overall_score":
      default:
        orderByClause = sortFn(matchingResults.overallScore);
    }

    // deepResearchedCount: total deep-researched tenders for company+status,
    // independent of the active keyword/score/quick/applied filters.
    const researchedConditions: SQL[] = [eq(matchingResults.companyId, companyId)];
    if (tenderStatus === "active") {
      researchedConditions.push(ne(tenders.status, "closed"));
    } else if (tenderStatus !== "all") {
      researchedConditions.push(eq(tenders.status, tenderStatus));
    }

    const [deepCountRows, deepResearchedRows, deepWindow, basicRaw] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(matchingResults)
          .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
          .where(deepWhere),
        db
          .select({ count: count() })
          .from(matchingResults)
          .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
          .where(and(...researchedConditions)),
        db
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
          .where(deepWhere)
          .orderBy(orderByClause)
          .limit(offset + pageSize),
        basicMatchTendersForCompany(companyId, {
          limit: 500,
          minScore: 0,
          requireSharedTaxonomy: false,
          ...(tenderStatus !== "active" && tenderStatus !== "all"
            ? { status: tenderStatus }
            : {}),
        }),
      ]);

    const deepMatchedCount = deepCountRows[0]?.count ?? 0;
    const deepResearchedCount = deepResearchedRows[0]?.count ?? 0;

    // Track each deep item's createdAt so the JS merge can mirror the SQL sort
    // exactly for created_at ordering (required for the window-superset proof).
    const deepUnified: Array<{ item: UnifiedMatchDeep; createdAt: Date | null }> =
      deepWindow.map((row) => {
        const m = row.match;
        const t = row.tender;
        return {
          item: {
            variant: "deep",
            resultId: m.id,
            tenderId: m.tenderId,
            title: t.title,
            buyer: t.buyer,
            description: t.description ?? null,
            location: t.location ?? null,
            deadline: toIsoString(t.deadline),
            status: t.status ?? null,
            budgetMin: t.budgetMin ?? null,
            budgetMax: t.budgetMax ?? null,
            currency: t.currency ?? null,
            score: m.overallScore ?? 0,
            capabilityScore: m.capabilityScore ?? 0,
            experienceScore: m.experienceScore ?? 0,
            locationScore: m.locationScore ?? 0,
            certificationScore: m.certificationScore ?? 0,
            matchReasons: m.matchReasons ?? [],
            isBookmarked: m.isBookmarked ?? false,
            isApplied: m.isApplied ?? false,
          },
          createdAt: m.createdAt ?? null,
        };
      });

    // ---- Basic overlay: bounded (~250), only tenders WITHOUT a deep row ------
    let basicCandidates = basicRaw;

    // basicMatch has no "active" concept (only exact status equality); enforce
    // not-closed in JS when the active view is requested.
    if (tenderStatus === "active") {
      basicCandidates = basicCandidates.filter((b) => b.status !== "closed");
    }

    // Dedup against deep results (deep always wins). Query is bounded to the
    // <=250 basic candidate ids regardless of how many deep rows exist.
    const basicIds = basicCandidates.map((b) => b.tenderId);
    const deepIdRows = basicIds.length
      ? await db
          .select({ tenderId: matchingResults.tenderId })
          .from(matchingResults)
          .where(
            and(
              eq(matchingResults.companyId, companyId),
              inArray(matchingResults.tenderId, basicIds),
            ),
          )
      : [];
    const deepIdSet = new Set(deepIdRows.map((r) => r.tenderId));

    // applied/bookmarked are deep-only attributes; a non-deep tender has none.
    const basicExcludedByApplied =
      showApplied === "applied" || showApplied === "bookmarked";

    const keywordLower = keyword.trim().toLowerCase();
    const now = Date.now();
    const sevenDaysMs = now + 7 * 24 * 60 * 60 * 1000;

    let basicScored = basicExcludedByApplied
      ? []
      : basicCandidates
          .filter((b) => !deepIdSet.has(b.tenderId))
          .map((b) => ({ b, score: Math.round((b.similarity ?? 0) * 100) }))
          .filter(({ score }) => score >= effectiveMin && score <= maxScore);

    if (keywordLower) {
      basicScored = basicScored.filter(
        ({ b }) =>
          b.title?.toLowerCase().includes(keywordLower) ||
          b.buyer?.toLowerCase().includes(keywordLower) ||
          (b.location?.toLowerCase().includes(keywordLower) ?? false),
      );
    }

    if (quickFilter === "high_score") {
      basicScored = basicScored.filter(({ score }) => score >= 80);
    } else if (quickFilter === "urgent") {
      basicScored = basicScored.filter(({ b }) => {
        const d = toEpochMs(b.deadline);
        if (d == null) return false;
        return d >= now && d <= sevenDaysMs;
      });
    }

    // Hydrate the fields basicMatch doesn't return (description, budgets).
    const survivingIds = basicScored.map(({ b }) => b.tenderId);
    const hydrateRows = survivingIds.length
      ? await db
          .select({
            id: tenders.id,
            description: tenders.description,
            budgetMin: tenders.budgetMin,
            budgetMax: tenders.budgetMax,
            currency: tenders.currency,
          })
          .from(tenders)
          .where(inArray(tenders.id, survivingIds))
      : [];
    const hydrateMap = new Map(hydrateRows.map((r) => [r.id, r]));

    let basicUnified: UnifiedMatchBasic[] = basicScored.map(({ b, score }) => {
      const h = hydrateMap.get(b.tenderId);
      return {
        variant: "basic",
        tenderId: b.tenderId,
        title: b.title,
        buyer: b.buyer,
        description: h?.description ?? null,
        location: b.location ?? null,
        deadline: toIsoString(b.deadline),
        status: b.status ?? null,
        budgetMin: h?.budgetMin ?? null,
        budgetMax: h?.budgetMax ?? null,
        currency: h?.currency ?? null,
        score,
      };
    });

    // high_value needs budgets, so it runs after hydration (deep handles it in SQL).
    if (quickFilter === "high_value") {
      basicUnified = basicUnified.filter(
        (m) => (m.budgetMax ?? 0) >= 1_000_000 || (m.budgetMin ?? 0) >= 1_000_000,
      );
    }

    // ---- Merge + paginate ----------------------------------------------------
    const dir = sortDirection === "asc" ? 1 : -1;
    const rankOf = (item: UnifiedMatch, createdAt: Date | null): number => {
      switch (sortBy) {
        case "capability_score":
          return item.variant === "deep" ? item.capabilityScore : item.score;
        case "experience_score":
          return item.variant === "deep" ? item.experienceScore : item.score;
        case "location_score":
          return item.variant === "deep" ? item.locationScore : item.score;
        case "certification_score":
          return item.variant === "deep" ? item.certificationScore : item.score;
        case "deadline":
          return item.deadline
            ? new Date(item.deadline).getTime()
            : dir > 0
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY;
        case "budget":
          return item.budgetMax ?? 0;
        case "created_at":
          return createdAt ? createdAt.getTime() : 0;
        case "overall_score":
        default:
          return item.score;
      }
    };

    const ranked: Array<{ item: UnifiedMatch; rank: number; tie: string }> = [];
    for (const { item, createdAt } of deepUnified) {
      ranked.push({ item, rank: rankOf(item, createdAt), tie: item.tenderId });
    }
    for (const item of basicUnified) {
      ranked.push({ item, rank: rankOf(item, null), tie: item.tenderId });
    }
    ranked.sort((a, b) => {
      const d = (a.rank - b.rank) * dir;
      if (d !== 0) return d;
      return a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0;
    });

    const results = ranked
      .slice(offset, offset + pageSize)
      .map((r) => r.item);

    // Deep and basic are disjoint (dedup above) and basic is fully materialized,
    // so the matched total is just the sum.
    const matchedCount = deepMatchedCount + basicUnified.length;

    const response: TenderMatchesResponse = {
      results,
      matchedCount,
      deepResearchedCount,
      page,
      pageSize,
    };
    return apiResponse(response);
  } catch (error) {
    return handleApiError(error);
  }
}
