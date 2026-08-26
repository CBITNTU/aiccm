/* eslint-disable @typescript-eslint/no-explicit-any -- join row types */
import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  companies,
  companyCapabilities,
  companyCapabilitiesRef,
} from "@/lib/db/schema/app";
import { localizedName, localizedCategory } from "@/lib/taxonomy/localizedName";
import { eq, and, inArray, ilike, or } from "drizzle-orm";
import { nearbyCompanies } from "@/lib/db/raw";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const {
      capabilityIds,
      excludeCompanyIds = [],
      lat: userLat,
      lng: userLng,
      radiusMiles,
    }: {
      capabilityIds: string[];
      excludeCompanyIds?: string[];
      lat?: number;
      lng?: number;
      radiusMiles?: number;
    } = body;
    const hasLocation =
      userLat != null && userLng != null && !isNaN(userLat) && !isNaN(userLng);

    if (!capabilityIds || capabilityIds.length === 0) {
      return apiResponse({ companies: [] });
    }

    // Get capability info for fallback text search
    const capabilityCheck = await db
      .select({ id: companyCapabilitiesRef.id, name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh), category: localizedCategory(companyCapabilitiesRef.category, companyCapabilitiesRef.categoryZh) })
      .from(companyCapabilitiesRef)
      .where(inArray(companyCapabilitiesRef.id, capabilityIds));

    // Join query to get companies with matching capabilities
    const companyCapabilitiesData = await db
      .select({
        companyId: companyCapabilities.companyId,
        capabilityId: companyCapabilities.capabilityId,
        company: {
          id: companies.id,
          companyName: companies.companyName,
          logoUrl: companies.logoUrl,
          companiesHouseNumber: companies.companiesHouseNumber,
          contactEmail: companies.contactEmail,
          contactPhone: companies.contactPhone,
          postcode: companies.postcode,
          address: companies.address,
          description: companies.description,
          websiteUrl: companies.websiteUrl,
          keyCapabilities: companies.keyCapabilities,
          certifications: companies.certifications,
          status: companies.status,
          isSystemCompany: companies.isSystemCompany,
          latitude: companies.latitude,
          longitude: companies.longitude,
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
        },
      })
      .from(companyCapabilities)
      .innerJoin(companies, eq(companyCapabilities.companyId, companies.id))
      .where(inArray(companyCapabilities.capabilityId, capabilityIds));

    // FALLBACK: If no companies found by capability IDs, try text search
    if (
      companyCapabilitiesData.length === 0 &&
      capabilityCheck.length > 0
    ) {
      const genericWords = new Set([
        "services", "service", "solutions", "solution", "management",
        "consulting", "consultancy", "design", "development",
        "installation", "maintenance", "support",
      ]);

      const searchKeywords = capabilityCheck
        .map((c) => {
          const words = (c.name || "").toLowerCase().split(/\s+/);
          return words.filter((w) => w.length > 4 && !genericWords.has(w));
        })
        .flat()
        .filter((term, index, arr) => arr.indexOf(term) === index)
        .slice(0, 3);

      if (searchKeywords.length > 0) {
        const orConditions = searchKeywords.flatMap((keyword) => {
          const safe = sanitizeLikeParam(keyword);
          return [
            ilike(companies.description, `%${safe}%`),
            ilike(companies.keyCapabilities, `%${safe}%`),
          ];
        });

        const textSearchResults = await db
          .select({
            id: companies.id,
            companyName: companies.companyName,
            logoUrl: companies.logoUrl,
            companiesHouseNumber: companies.companiesHouseNumber,
            contactEmail: companies.contactEmail,
            contactPhone: companies.contactPhone,
            postcode: companies.postcode,
            address: companies.address,
            description: companies.description,
            websiteUrl: companies.websiteUrl,
            keyCapabilities: companies.keyCapabilities,
            certifications: companies.certifications,
            status: companies.status,
            isSystemCompany: companies.isSystemCompany,
            latitude: companies.latitude,
            longitude: companies.longitude,
            createdAt: companies.createdAt,
            updatedAt: companies.updatedAt,
          })
          .from(companies)
          .where(and(eq(companies.status, "active"), or(...orConditions)))
          .limit(50);

        if (textSearchResults.length > 0) {
          const filteredResults = textSearchResults.filter((company) => {
            const desc = (company.description || "").toLowerCase();
            const keyCaps = (company.keyCapabilities || "").toLowerCase();
            const combined = `${desc} ${keyCaps}`;

            const keywordMatches = searchKeywords.filter((keyword) =>
              combined.includes(keyword),
            ).length;
            const fullNameMatches = capabilityCheck.some((cap) => {
              const fullName = (cap.name || "").toLowerCase();
              return (
                combined.includes(fullName) ||
                combined.includes(fullName.replace(/\s+/g, " "))
              );
            });

            return (
              keywordMatches >= Math.min(2, searchKeywords.length) ||
              fullNameMatches
            );
          });

          if (filteredResults.length > 0) {
            const uniqueMap = new Map<string, any>();
            filteredResults.forEach((company) => {
              if (
                !uniqueMap.has(company.id) &&
                !excludeCompanyIds.includes(company.id)
              ) {
                uniqueMap.set(company.id, company);
              }
            });

            const companiesArray = Array.from(uniqueMap.values()).toSorted(
              (a, b) => a.companyName.localeCompare(b.companyName),
            );

            const companiesWithCapabilities = await Promise.all(
              companiesArray.map(async (company) => {
                const capabilities = await db
                  .select({
                    id: companyCapabilitiesRef.id,
                    name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh),
                  })
                  .from(companyCapabilities)
                  .innerJoin(companyCapabilitiesRef, eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id))
                  .where(
                    and(
                      eq(companyCapabilities.companyId, company.id),
                      inArray(companyCapabilities.capabilityId, capabilityIds),
                    ),
                  );

                return {
                  ...company,
                  capabilities: capabilities.length > 0
                    ? capabilities
                    : capabilityCheck.map((c) => ({ id: c.id, name: c.name })),
                };
              }),
            );

            return applyLocationAndRespond(
              companiesWithCapabilities,
              hasLocation,
              userLat,
              userLng,
              radiusMiles,
            );
          }
        }
      }
    }

    // Deduplicate companies and filter by status
    const uniqueCompanies = new Map<string, any>();

    companyCapabilitiesData.forEach((item) => {
      const company = item.company;
      if (
        company &&
        (company.status === "active" || company.status === "pending_review") &&
        !uniqueCompanies.has(company.id) &&
        !excludeCompanyIds.includes(company.id)
      ) {
        uniqueCompanies.set(company.id, { ...company, capabilities: [] });
      }
    });

    const companiesArray = Array.from(uniqueCompanies.values()).toSorted(
      (a, b) => a.companyName.localeCompare(b.companyName),
    );

    const companiesWithCapabilities = await Promise.all(
      companiesArray.map(async (company) => {
        const capabilities = await db
          .select({
            id: companyCapabilitiesRef.id,
            name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh),
          })
          .from(companyCapabilities)
          .innerJoin(companyCapabilitiesRef, eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id))
          .where(
            and(
              eq(companyCapabilities.companyId, company.id),
              inArray(companyCapabilities.capabilityId, capabilityIds),
            ),
          );

        return {
          ...company,
          capabilities,
        };
      }),
    );

    return applyLocationAndRespond(
      companiesWithCapabilities,
      hasLocation,
      userLat,
      userLng,
      radiusMiles,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * If the user provided coordinates, re-query via the PostGIS function to get
 * distance-sorted results for the given company IDs. Otherwise return as-is.
 */
async function applyLocationAndRespond(
  companiesList: any[],
  hasLocation: boolean,
  userLat: number | undefined,
  userLng: number | undefined,
  radiusMiles: number | undefined,
) {
  if (!hasLocation || companiesList.length === 0) {
    return apiResponse({ companies: companiesList });
  }

  const companyIds = companiesList.map((c: any) => c.id);

  const data = await nearbyCompanies({
    userLat: userLat!,
    userLng: userLng!,
    radiusMiles: radiusMiles ?? null,
    searchText: null,
    companyIds,
    pageNum: 1,
    pageSize: companyIds.length,
  });

  const distanceByCompany: Record<string, number> = {};

  for (const row of data) {
    if (row.distanceMiles != null) {
      distanceByCompany[row.id] = row.distanceMiles;
    }
  }

  // Merge capabilities back: the RPC returns raw company columns,
  // but we already have capabilities attached — build a lookup.
  const capLookup = new Map<string, any[]>();
  for (const c of companiesList) {
    capLookup.set(c.id, c.capabilities || []);
  }

  const sortedCompanies = data.map((row: any) => ({
    ...row,
    capabilities: capLookup.get(row.id) || [],
  }));

  return apiResponse({
    companies: sortedCompanies,
    distanceByCompany,
  });
}
