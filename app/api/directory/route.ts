import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, companyTaxonomies, taxonomies, companyMarkets, markets, companyStandards, standardsRef } from "@/lib/db/schema/app";
import { eq, and, or, ilike, inArray, asc, count } from "drizzle-orm";
import { nearbyCompanies } from "@/lib/db/raw";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

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

    // Pre-filter by taxonomy IDs if provided
    let filteredCompanyIds: string[] | null = null;
    if (taxonomyIds) {
      const ids = taxonomyIds.split(",").filter(Boolean);
      if (ids.length > 0) {
        const taxResults = await db
          .select({ companyId: companyTaxonomies.companyId })
          .from(companyTaxonomies)
          .where(inArray(companyTaxonomies.taxonomyId, ids));

        if (taxResults.length > 0) {
          filteredCompanyIds = [...new Set(taxResults.map((c) => c.companyId))];
        } else {
          return apiResponse({ companies: [], totalCount: 0, page, totalPages: 0 });
        }
      }
    }

    let companiesData: Record<string, unknown>[] = [];
    let totalCount: number;
    let totalPages: number;
    const distanceByCompany: Record<string, number> = {};

    if (hasLocation) {
      const safeSearch = sanitizeLikeParam(search) || null;

      const rows = await nearbyCompanies({
        userLat: userLat!,
        userLng: userLng!,
        radiusMiles,
        searchText: safeSearch,
        companyIds: filteredCompanyIds,
        pageNum: page,
        pageSize: limit,
      });

      totalCount = rows.length > 0 ? Number(rows[0].totalCount) : 0;
      totalPages = Math.ceil(totalCount / limit);

      companiesData = rows;
      for (const row of rows) {
        if (row.distanceMiles != null) {
          distanceByCompany[row.id] = row.distanceMiles;
        }
      }
    } else {
      // Standard query — alphabetical, DB-paginated
      const offset = (page - 1) * limit;

      const conditions = [eq(companies.status, "active")];

      if (filteredCompanyIds) {
        conditions.push(inArray(companies.id, filteredCompanyIds));
      }

      const safeSearch = sanitizeLikeParam(search);
      if (safeSearch) {
        conditions.push(
          or(
            ilike(companies.companyName, `%${safeSearch}%`),
            ilike(companies.description, `%${safeSearch}%`),
          )!,
        );
      }

      const whereClause = and(...conditions);

      const [countResult, data] = await Promise.all([
        db.select({ count: count() }).from(companies).where(whereClause),
        db
          .select({
            id: companies.id,
            companyName: companies.companyName,
            description: companies.description,
            keyCapabilities: companies.keyCapabilities,
            postcode: companies.postcode,
            certifications: companies.certifications,
            equipment: companies.equipment,
            pastProjects: companies.pastProjects,
            isSystemCompany: companies.isSystemCompany,
            status: companies.status,
            marketPosition: companies.marketPosition,
            safetyRating: companies.safetyRating,
            digitalMaturity: companies.digitalMaturity,
            aiCompetencies: companies.aiCompetencies,
            aiCapabilities: companies.aiCapabilities,
            aiAnalysis: companies.aiAnalysis,
            latitude: companies.latitude,
            longitude: companies.longitude,
            createdAt: companies.createdAt,
            updatedAt: companies.updatedAt,
            userId: companies.userId,
          })
          .from(companies)
          .where(whereClause)
          .orderBy(asc(companies.companyName))
          .limit(limit)
          .offset(offset),
      ]);

      companiesData = data;
      totalCount = countResult[0]?.count || 0;
      totalPages = Math.ceil(totalCount / limit);
    }

    // Fetch taxonomies for returned companies
    const companyIds = companiesData.map((c) => (c.id as string) || (c as { id: string }).id);
    let taxonomiesByCompany: Record<string, { id: string; name: string }[]> = {};
    let marketsByCompany: Record<string, { id: string; name: string }[]> = {};
    let standardsByCompany: Record<string, { id: string; name: string }[]> = {};

    if (companyIds.length > 0) {
      const taxData = await db
        .select({
          companyId: companyTaxonomies.companyId,
          taxonomyId: taxonomies.id,
          taxonomyName: taxonomies.name,
        })
        .from(companyTaxonomies)
        .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
        .where(inArray(companyTaxonomies.companyId, companyIds));

      taxonomiesByCompany = {};
      for (const ct of taxData) {
        if (!ct.taxonomyName) continue;
        if (!taxonomiesByCompany[ct.companyId]) {
          taxonomiesByCompany[ct.companyId] = [];
        }
        taxonomiesByCompany[ct.companyId].push({
          id: ct.taxonomyId,
          name: ct.taxonomyName,
        });
      }

      // Fetch markets for all returned companies
      const marketsData = await db
        .select({
          companyId: companyMarkets.companyId,
          marketId: markets.id,
          marketName: markets.name,
        })
        .from(companyMarkets)
        .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
        .where(inArray(companyMarkets.companyId, companyIds));

      marketsByCompany = {};
      for (const row of marketsData) {
        if (!row.marketName) continue;
        if (!marketsByCompany[row.companyId]) {
          marketsByCompany[row.companyId] = [];
        }
        marketsByCompany[row.companyId].push({ id: row.marketId, name: row.marketName });
      }

      // Fetch standards for all returned companies
      const standardsData = await db
        .select({
          companyId: companyStandards.companyId,
          standardId: standardsRef.id,
          standardName: standardsRef.name,
        })
        .from(companyStandards)
        .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
        .where(inArray(companyStandards.companyId, companyIds));

      standardsByCompany = {};
      for (const row of standardsData) {
        if (!row.standardName) continue;
        if (!standardsByCompany[row.companyId]) {
          standardsByCompany[row.companyId] = [];
        }
        standardsByCompany[row.companyId].push({ id: row.standardId, name: row.standardName });
      }
    }

    return apiResponse({
      companies: companiesData,
      taxonomiesByCompany,
      marketsByCompany,
      standardsByCompany,
      ...(hasLocation && { distanceByCompany }),
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
