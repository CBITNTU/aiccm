import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  AuthError,
  ValidationError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { getCompanyAccess } from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { curatedMatches, matchingResults, tenders } from "@/lib/db/schema/app";
import { basicMatchTendersForCompany } from "@/lib/services/basicMatchingService";
import {
  activeCurationCondition,
  applyCuration,
  effectiveScoreSql,
  getCurationOverlay,
  type CurationOverlayEntry,
} from "@/lib/services/curatedMatches";
import {
  eq,
  and,
  or,
  ne,
  notInArray,
  ilike,
  gte,
  lte,
  asc,
  desc,
  count,
  inArray,
  sql,
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
 * `view=ruled_out` inverts the score rule and returns exactly the rows the
 * default view hides: tenders we spent a deep analysis on that came back at 0%
 * (or NULL). The semantic overlay is skipped entirely there — a basic 0% row was
 * never analysed, so it isn't a "ruled out" result, and excluding it makes the
 * ruled-out path a straight paginated SQL query.
 *
 * Scalability: the deep set can grow to thousands, the basic overlay is
 * structurally bounded (~250). We fetch at most `offset + pageSize` deep rows
 * (SQL ORDER BY ... LIMIT) and merge them with the full basic overlay. Because
 * basic items can only push a deep item to a HIGHER union rank (never lower),
 * the top `offset + pageSize` deep rows are a superset of every deep item that
 * can appear at/before union position `offset + pageSize` — so slicing the
 * requested page from that bounded merge is exact. Memory stays bounded.
 *
 * Curated matches (lib/services/curatedMatches.ts) ride on that same argument.
 * A curation is a score FLOOR, so it can only raise an item's rank, and the
 * effective score is computed in SQL — so the window, the filters and the counts
 * all agree. Pinned curations are the one exception: they jump the ordering
 * outright, so they're materialized as their own small set, excluded from the
 * window and the overlay, and prepended. A fully materialized set can't break
 * the proof for the same reason the basic overlay can't.
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

    const view =
      url.searchParams.get("view") === "ruled_out" ? "ruled_out" : "matched";
    const isRuledOut = view === "ruled_out";
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

    const { hasAccess } = await getCompanyAccess(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    // Fold the "hide 0% matches" rule (MIN_MATCH_SCORE = 1) and the user's
    // minScore filter into a single lower bound so 0% rows never surface.
    const effectiveMin = Math.max(minScore, 1);

    // ---- Curated overlay -----------------------------------------------------
    // Loaded once and used on every side of the merge. The deep side folds it
    // into SQL (so filters, counts and ordering agree); the basic and orphan
    // sides apply it in JS from this same map.
    const curation = await getCurationOverlay(companyId);

    // A pin jumps the ordering outright, so it only applies in the default view.
    // Under an explicit deadline/budget/ascending sort a pinned 41% sitting above
    // a 92% is exactly the anomaly a user notices — there, curation degrades to
    // the score floor alone, which looks like nothing at all.
    const pinApplies =
      sortBy === "overall_score" && sortDirection === "desc" && !isRuledOut;
    const pinnedIds = pinApplies
      ? [...curation.values()]
          .filter((c) => c.pinned)
          .sort((a, b) => (a.pinRank ?? 0) - (b.pinRank ?? 0))
          .map((c) => c.tenderId)
      : [];
    const pinnedOrder = new Map(pinnedIds.map((id, i) => [id, i]));

    // Join predicate for the curated overlay. `activeCurationCondition` keeps
    // drafts and expired curations out of every user-facing read.
    const curationJoin = and(
      eq(curatedMatches.companyId, matchingResults.companyId),
      eq(curatedMatches.tenderId, matchingResults.tenderId),
      activeCurationCondition(),
    )!;

    // The exact complement of `effectiveScore >= 1`: everything the matched view
    // hides. GREATEST/COALESCE already folds a NULL real score to 0, so a row
    // that was never scored still lands here rather than vanishing from both
    // views — and a curated row is pulled out of it automatically.
    const ruledOutScore = lte(effectiveScoreSql, 0);

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

    if (isRuledOut) {
      // The user's score range is meaningless when every row scores 0, so it is
      // deliberately ignored here rather than intersected.
      conditions.push(ruledOutScore);
    } else {
      conditions.push(gte(effectiveScoreSql, effectiveMin));
      conditions.push(lte(effectiveScoreSql, maxScore));
    }

    if (showApplied === "applied") {
      conditions.push(eq(matchingResults.isApplied, true));
    } else if (showApplied === "not_applied") {
      conditions.push(eq(matchingResults.isApplied, false));
    } else if (showApplied === "bookmarked") {
      conditions.push(eq(matchingResults.isBookmarked, true));
    }

    if (quickFilter === "high_score" && !isRuledOut) {
      conditions.push(gte(effectiveScoreSql, 80));
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
        // Undisclosed budgets (NULL) always sort to the bottom, regardless of
        // direction. Must mirror the JS merge below so the deep window remains a
        // correct superset of the paginated result.
        orderByClause =
          sortDirection === "asc"
            ? sql`${tenders.budgetMax} asc nulls last`
            : sql`${tenders.budgetMax} desc nulls last`;
        break;
      case "overall_score":
      default:
        orderByClause = sortFn(effectiveScoreSql);
    }

    // deepResearchedCount: total deep-researched tenders for company+status,
    // independent of the active keyword/score/quick/applied filters.
    const researchedConditions: SQL[] = [eq(matchingResults.companyId, companyId)];
    if (tenderStatus === "active") {
      researchedConditions.push(ne(tenders.status, "closed"));
    } else if (tenderStatus !== "all") {
      researchedConditions.push(eq(tenders.status, tenderStatus));
    }

    const deepTenderFields = {
      title: tenders.title,
      buyer: tenders.buyer,
      description: tenders.description,
      location: tenders.location,
      deadline: tenders.deadline,
      budgetMin: tenders.budgetMin,
      budgetMax: tenders.budgetMax,
      currency: tenders.currency,
      status: tenders.status,
    } as const;

    const [
      deepCountRows,
      deepResearchedRows,
      ruledOutRows,
      deepWindow,
      pinnedWindow,
      basicRaw,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .leftJoin(curatedMatches, curationJoin)
        .where(deepWhere),
      db
        .select({ count: count() })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .where(and(...researchedConditions)),
      // ruledOutCount is returned in BOTH views so the matched view can
      // advertise how many results live behind the "Ruled out" toggle. It is
      // deliberately unfiltered (company + tender status only) so the badge
      // doesn't flicker as the user narrows the matched list.
      db
        .select({ count: count() })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .leftJoin(curatedMatches, curationJoin)
        .where(and(...researchedConditions, ruledOutScore)),
      db
        .select({ match: matchingResults, tender: deepTenderFields })
        .from(matchingResults)
        .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
        .leftJoin(curatedMatches, curationJoin)
        .where(
          pinnedIds.length
            ? and(deepWhere, notInArray(matchingResults.tenderId, pinnedIds))
            : deepWhere,
        )
        .orderBy(orderByClause)
        .limit(offset + pageSize),
      // Pinned curations bypass the ordering, so the bounded window above can't
      // be relied on to contain them. The set is small (a company's pinned
      // curations) and fully materialized, which is what keeps the page slice
      // exact. It still respects every active filter — a pin is a ranking
      // override, not a licence to ignore the user's own search.
      pinnedIds.length
        ? db
            .select({ match: matchingResults, tender: deepTenderFields })
            .from(matchingResults)
            .innerJoin(tenders, eq(matchingResults.tenderId, tenders.id))
            .leftJoin(curatedMatches, curationJoin)
            .where(and(deepWhere, inArray(matchingResults.tenderId, pinnedIds)))
        : Promise.resolve([]),
      // The semantic overlay has no place in the ruled-out view (see the file
      // header), so skip the work entirely rather than filtering it later.
      isRuledOut
        ? Promise.resolve(
            [] as Awaited<ReturnType<typeof basicMatchTendersForCompany>>,
          )
        : basicMatchTendersForCompany(companyId, {
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
    const ruledOutCount = ruledOutRows[0]?.count ?? 0;

    type DeepRow = (typeof deepWindow)[number];

    /**
     * Map a deep row to its user-facing shape, with any curation applied.
     *
     * `rankScore` carries the *pre-curation* sub-scores used for the sub-score
     * sorts: the SQL ORDER BY reads the real columns there, so the JS merge has
     * to as well or the window stops being a superset. For `overall_score` the
     * SQL sorts on the effective score, which is exactly what curation writes
     * into `item.score` — so the two agree by construction.
     */
    const toDeepItem = (
      row: DeepRow,
    ): {
      item: UnifiedMatchDeep;
      createdAt: Date | null;
      rankScores: {
        capability: number;
        experience: number;
        location: number;
        certification: number;
      };
    } => {
      const m = row.match;
      const t = row.tender;
      const base: UnifiedMatchDeep = {
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
      };
      return {
        item: applyCuration(base, curation.get(m.tenderId)),
        createdAt: m.createdAt ?? null,
        rankScores: {
          capability: base.capabilityScore,
          experience: base.experienceScore,
          location: base.locationScore,
          certification: base.certificationScore,
        },
      };
    };

    const deepUnified = deepWindow.map(toDeepItem);
    const pinnedDeep = pinnedWindow.map(toDeepItem);

    // ---- Orphan curations ----------------------------------------------------
    // A published curation whose deep row never landed (or was deleted while the
    // curation stayed live) still has to render, or the admin's pick silently
    // disappears from the feed. It's synthesized from the frozen breakdown, so
    // it presents as an ordinary deep card.
    const deepTenderIds = new Set([
      ...deepWindow.map((r) => r.match.tenderId),
      ...pinnedWindow.map((r) => r.match.tenderId),
    ]);
    const curatedIds = [...curation.keys()];

    // applied/bookmarked are deep-only attributes; a synthesized item has none.
    const orphanExcludedByApplied =
      showApplied === "applied" || showApplied === "bookmarked";

    let orphanUnified: Array<{ item: UnifiedMatchDeep; curation: CurationOverlayEntry }> =
      [];

    if (curatedIds.length && !isRuledOut && !orphanExcludedByApplied) {
      const withDeepRows = await db
        .select({ tenderId: matchingResults.tenderId })
        .from(matchingResults)
        .where(
          and(
            eq(matchingResults.companyId, companyId),
            inArray(matchingResults.tenderId, curatedIds),
          ),
        );
      for (const row of withDeepRows) deepTenderIds.add(row.tenderId);

      const orphanIds = curatedIds.filter((id) => !deepTenderIds.has(id));
      if (orphanIds.length) {
        const orphanConditions: SQL[] = [inArray(tenders.id, orphanIds)];
        if (tenderStatus === "active") {
          orphanConditions.push(ne(tenders.status, "closed"));
        } else if (tenderStatus !== "all") {
          orphanConditions.push(eq(tenders.status, tenderStatus));
        }
        if (safeKeyword) {
          orphanConditions.push(
            or(
              ilike(tenders.title, `%${safeKeyword}%`),
              ilike(tenders.description, `%${safeKeyword}%`),
              ilike(tenders.buyer, `%${safeKeyword}%`),
              ilike(tenders.location, `%${safeKeyword}%`),
            )!,
          );
        }
        if (quickFilter === "urgent") {
          const sevenDays = new Date();
          sevenDays.setDate(sevenDays.getDate() + 7);
          orphanConditions.push(gte(tenders.deadline, new Date()));
          orphanConditions.push(lte(tenders.deadline, sevenDays));
        } else if (quickFilter === "high_value") {
          orphanConditions.push(
            or(gte(tenders.budgetMax, 1000000), gte(tenders.budgetMin, 1000000))!,
          );
        }

        const orphanRows = await db
          .select({ id: tenders.id, ...deepTenderFields })
          .from(tenders)
          .where(and(...orphanConditions));

        orphanUnified = orphanRows.flatMap((t) => {
          const c = curation.get(t.id)!;
          const score = c.curatedScore ?? 0;
          if (score < effectiveMin || score > maxScore) return [];
          if (quickFilter === "high_score" && score < 80) return [];
          return [
            {
              item: {
                variant: "deep" as const,
                // No matching_results row exists, so there is nothing to bookmark
                // or delete — the client hides both actions on a null id. A
                // placeholder string here would be cast to uuid by those routes
                // and 500, and any recognisable prefix is a tell in the payload.
                resultId: null,
                tenderId: t.id,
                title: t.title,
                buyer: t.buyer,
                description: t.description ?? null,
                location: t.location ?? null,
                deadline: toIsoString(t.deadline),
                status: t.status ?? null,
                budgetMin: t.budgetMin ?? null,
                budgetMax: t.budgetMax ?? null,
                currency: t.currency ?? null,
                score,
                capabilityScore: c.capabilityScore ?? 0,
                experienceScore: c.experienceScore ?? 0,
                locationScore: c.locationScore ?? 0,
                certificationScore: c.certificationScore ?? 0,
                matchReasons: c.matchReasons ?? [],
                isBookmarked: false,
                isApplied: false,
              },
              curation: c,
            },
          ];
        });
      }
    }

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
    // Anything already emitted as a deep or synthesized-curated item. Without
    // the orphan ids a curated tender with no deep row would appear twice.
    for (const o of orphanUnified) deepIdSet.add(o.item.tenderId);

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
          .map((b) => {
            const raw = Math.round((b.similarity ?? 0) * 100);
            const c = curation.get(b.tenderId);
            // Floor semantics apply here too: a curated tender that fell through
            // to the semantic overlay still has to clear the user's score filter
            // on its curated value, not its raw similarity.
            return { b, score: Math.max(raw, c?.curatedScore ?? 0) };
          })
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
    /**
     * `subScores` carries the pre-curation values for deep rows so the sub-score
     * sorts mirror their SQL ORDER BY exactly (which reads the real columns).
     * Omitted for synthesized and basic items, which fall back to `score`.
     */
    const rankOf = (
      item: UnifiedMatch,
      createdAt: Date | null,
      subScores?: {
        capability: number;
        experience: number;
        location: number;
        certification: number;
      },
    ): number => {
      switch (sortBy) {
        case "capability_score":
          return subScores?.capability ?? item.score;
        case "experience_score":
          return subScores?.experience ?? item.score;
        case "location_score":
          return subScores?.location ?? item.score;
        case "certification_score":
          return subScores?.certification ?? item.score;
        case "deadline":
          return item.deadline
            ? new Date(item.deadline).getTime()
            : dir > 0
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY;
        case "budget":
          // Undisclosed budgets always sort last (mirror the SQL "nulls last").
          return item.budgetMax != null
            ? item.budgetMax
            : dir > 0
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY;
        case "created_at":
          return createdAt ? createdAt.getTime() : 0;
        case "overall_score":
        default:
          return item.score;
      }
    };

    const ranked: Array<{ item: UnifiedMatch; rank: number; tie: string }> = [];
    for (const { item, createdAt, rankScores } of deepUnified) {
      ranked.push({
        item,
        rank: rankOf(item, createdAt, rankScores),
        tie: item.tenderId,
      });
    }
    for (const { item } of orphanUnified) {
      if (pinnedOrder.has(item.tenderId)) continue;
      ranked.push({ item, rank: rankOf(item, null), tie: item.tenderId });
    }
    for (const item of basicUnified) {
      ranked.push({ item, rank: rankOf(item, null), tie: item.tenderId });
    }
    ranked.sort((a, b) => {
      const d = (a.rank - b.rank) * dir;
      if (d !== 0) return d;
      return a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0;
    });

    // Pinned items sit ahead of the ranked merge, in the admin's own order. The
    // set is fully materialized, so slicing the page across the concatenation is
    // still exact.
    const pinnedItems: UnifiedMatch[] = [
      ...pinnedDeep.map((d) => d.item),
      ...orphanUnified
        .filter((o) => pinnedOrder.has(o.item.tenderId))
        .map((o) => o.item),
    ].sort(
      (a, b) =>
        (pinnedOrder.get(a.tenderId) ?? 0) - (pinnedOrder.get(b.tenderId) ?? 0),
    );

    const results = [...pinnedItems, ...ranked.map((r) => r.item)].slice(
      offset,
      offset + pageSize,
    );

    // Deep, orphan and basic are disjoint (dedup above) and both the orphan and
    // basic sets are fully materialized, so the matched total is just the sum.
    // `deepMatchedCount` already includes the pinned rows — they were only split
    // out of the *window*, not out of the filter.
    const matchedCount =
      deepMatchedCount + orphanUnified.length + basicUnified.length;

    const response: TenderMatchesResponse = {
      results,
      matchedCount,
      deepResearchedCount,
      ruledOutCount,
      page,
      pageSize,
    };
    return apiResponse(response);
  } catch (error) {
    return handleApiError(error);
  }
}
