import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { tenders, tenderTaxonomies, taxonomies } from "@/lib/db/schema/app";
import { tenderListColumns } from "@/lib/db/columns";
import { eq, and, or, ne, ilike, inArray, gte, lte, asc, desc, count, sql, SQL } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

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
    const page = Math.max(parseInt(url.searchParams.get("page") || "1") || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "25") || 25, 1), 100);

    const offset = (page - 1) * pageSize;

    // Filter by taxonomy IDs if provided
    let filteredTenderIds: string[] | null = null;
    if (taxonomyIds) {
      const ids = taxonomyIds.split(",").filter(Boolean);
      if (ids.length > 0) {
        const taxResults = await db
          .select({ tenderId: tenderTaxonomies.tenderId })
          .from(tenderTaxonomies)
          .where(inArray(tenderTaxonomies.taxonomyId, ids));

        if (taxResults.length > 0) {
          filteredTenderIds = [...new Set(taxResults.map((t) => t.tenderId))];
        } else {
          return apiResponse({ tenders: [], totalCount: 0, taxonomies: {} });
        }
      }
    }

    // Build conditions
    const conditions: SQL[] = [];

    // Default: exclude closed tenders unless a specific status is requested
    if (status) {
      conditions.push(eq(tenders.status, status));
    } else {
      conditions.push(ne(tenders.status, "closed"));
    }

    if (filteredTenderIds) {
      conditions.push(inArray(tenders.id, filteredTenderIds));
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

    const safeLocation = sanitizeLikeParam(location);
    if (safeLocation) {
      conditions.push(ilike(tenders.location, `%${safeLocation}%`));
    }

    if (budgetMin) {
      conditions.push(gte(tenders.budgetMin, parseFloat(budgetMin)));
    }

    if (budgetMax) {
      conditions.push(lte(tenders.budgetMax, parseFloat(budgetMax)));
    }

    if (dateFrom.trim()) {
      conditions.push(gte(tenders.publicationDate, new Date(dateFrom)));
    }

    if (dateTo.trim()) {
      conditions.push(lte(tenders.publicationDate, new Date(dateTo)));
    }

    // Filter by source (derived from documents URL via JSONB path)
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
        conditions.push(
          or(
            sql`${tenders.documents}->>'specification_url' ILIKE ${"%" + domain + "%"}`,
            sql`${tenders.documents}->>'application_url' ILIKE ${"%" + domain + "%"}`,
          )!,
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort column
    const sortFn = sortDirection === "asc" ? asc : desc;
    let orderByClause;
    switch (sortBy) {
      case "deadline":
        orderByClause = sortFn(tenders.deadline);
        break;
      case "budget":
      case "budget_max":
        orderByClause = sortFn(tenders.budgetMax);
        break;
      case "budget_min":
        orderByClause = sortFn(tenders.budgetMin);
        break;
      case "publication_date":
        orderByClause = sortFn(tenders.publicationDate);
        break;
      case "title":
        orderByClause = sortFn(tenders.title);
        break;
      default:
        orderByClause = sortFn(tenders.deadline);
    }

    const [countResult, data] = await Promise.all([
      db.select({ count: count() }).from(tenders).where(whereClause),
      db
        .select(tenderListColumns)
        .from(tenders)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset),
    ]);

    const totalCount = countResult[0]?.count || 0;

    // Fetch taxonomies for returned tenders
    const tenderIdList = data.map((t) => t.id);
    const taxonomiesMap: Record<string, { id: string; name: string }[]> = {};

    if (tenderIdList.length > 0) {
      const taxData = await db
        .select({
          tenderId: tenderTaxonomies.tenderId,
          taxonomyId: taxonomies.id,
          taxonomyName: taxonomies.name,
        })
        .from(tenderTaxonomies)
        .innerJoin(taxonomies, eq(tenderTaxonomies.taxonomyId, taxonomies.id))
        .where(inArray(tenderTaxonomies.tenderId, tenderIdList));

      for (const tt of taxData) {
        if (!tt.taxonomyName) continue;
        if (!taxonomiesMap[tt.tenderId]) {
          taxonomiesMap[tt.tenderId] = [];
        }
        taxonomiesMap[tt.tenderId].push({
          id: tt.taxonomyId,
          name: tt.taxonomyName,
        });
      }
    }

    return apiResponse({ tenders: data, totalCount, taxonomies: taxonomiesMap });
  } catch (error) {
    return handleApiError(error);
  }
}
