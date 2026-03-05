import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase join types */

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createAdminClient();

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
    const { data: capabilityCheck } = await supabase
      .from("company_capabilities_ref")
      .select("id, name, category")
      .in("id", capabilityIds);

    // Join query to get companies with matching capabilities
    const { data: companyCapabilitiesData, error: joinError } = await supabase
      .from("company_capabilities")
      .select(
        `
        company_id,
        capability_id,
        companies!inner(
          id,
          company_name,
          companies_house_number,
          contact_email,
          contact_phone,
          postcode,
          address,
          description,
          website_url,
          key_capabilities,
          certifications,
          status,
          user_id,
          is_system_company,
          latitude,
          longitude,
          created_at,
          updated_at
        )
      `,
      )
      .in("capability_id", capabilityIds);

    if (joinError) throw joinError;

    // FALLBACK: If no companies found by capability IDs, try text search
    if (
      (companyCapabilitiesData?.length || 0) === 0 &&
      capabilityCheck &&
      capabilityCheck.length > 0
    ) {
      const genericWords = new Set([
        "services",
        "service",
        "solutions",
        "solution",
        "management",
        "consulting",
        "consultancy",
        "design",
        "development",
        "installation",
        "maintenance",
        "support",
      ]);

      const searchKeywords = capabilityCheck
        .map((c) => {
          const words = c.name.toLowerCase().split(/\s+/);
          return words.filter((w) => w.length > 4 && !genericWords.has(w));
        })
        .flat()
        .filter((term, index, arr) => arr.indexOf(term) === index)
        .slice(0, 3);

      if (searchKeywords.length > 0) {
        const orConditions = searchKeywords
          .map((keyword) => {
            const safe = sanitizeLikeParam(keyword);
            return `description.ilike.%${safe}%,key_capabilities.ilike.%${safe}%`;
          })
          .join(",");

        const { data: textSearchResults, error: textSearchError } =
          await supabase
            .from("companies")
            .select(
              "id, company_name, companies_house_number, contact_email, contact_phone, postcode, address, description, website_url, key_capabilities, certifications, status, user_id, is_system_company, latitude, longitude, created_at, updated_at",
            )
            .eq("status", "active")
            .or(orConditions)
            .limit(50);

        if (
          !textSearchError &&
          textSearchResults &&
          textSearchResults.length > 0
        ) {
          const filteredResults = textSearchResults.filter((company: any) => {
            const desc = (company.description || "").toLowerCase();
            const keyCaps = (company.key_capabilities || "").toLowerCase();
            const combined = `${desc} ${keyCaps}`;

            const keywordMatches = searchKeywords.filter((keyword) =>
              combined.includes(keyword),
            ).length;
            const fullNameMatches = capabilityCheck.some((cap) => {
              const fullName = cap.name.toLowerCase();
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
            filteredResults.forEach((company: any) => {
              if (
                !uniqueMap.has(company.id) &&
                !excludeCompanyIds.includes(company.id)
              ) {
                uniqueMap.set(company.id, company);
              }
            });

            const companiesArray = Array.from(uniqueMap.values()).toSorted(
              (a, b) => a.company_name.localeCompare(b.company_name),
            );

            const companiesWithCapabilities = await Promise.all(
              companiesArray.map(async (company) => {
                const { data: capabilities } = await supabase
                  .from("company_capabilities")
                  .select(
                    "capability_id, company_capabilities_ref(id, name)",
                  )
                  .eq("company_id", company.id)
                  .in("capability_id", capabilityIds);

                return {
                  ...company,
                  capabilities:
                    capabilities?.map((c: any) => ({
                      id: c.company_capabilities_ref.id,
                      name: c.company_capabilities_ref.name,
                    })) ||
                    capabilityCheck.map((c) => ({ id: c.id, name: c.name })),
                };
              }),
            );

            return applyLocationAndRespond(
              companiesWithCapabilities,
              hasLocation,
              userLat,
              userLng,
              radiusMiles,
              supabase,
            );
          }
        }
      }
    }

    // Deduplicate companies and filter by status
    const uniqueCompanies = new Map<string, any>();

    (companyCapabilitiesData || []).forEach((item: any) => {
      const company = item.companies;
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
      (a, b) => a.company_name.localeCompare(b.company_name),
    );

    const companiesWithCapabilities = await Promise.all(
      companiesArray.map(async (company) => {
        const { data: capabilities } = await supabase
          .from("company_capabilities")
          .select("capability_id, company_capabilities_ref(id, name)")
          .eq("company_id", company.id)
          .in("capability_id", capabilityIds);

        return {
          ...company,
          capabilities:
            capabilities?.map((c: any) => ({
              id: c.company_capabilities_ref.id,
              name: c.company_capabilities_ref.name,
            })) || [],
        };
      }),
    );

    return applyLocationAndRespond(
      companiesWithCapabilities,
      hasLocation,
      userLat,
      userLng,
      radiusMiles,
      supabase,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * If the user provided coordinates, re-query via the PostGIS RPC to get
 * distance-sorted results for the given company IDs. Otherwise return as-is.
 */
async function applyLocationAndRespond(
  companies: any[],
  hasLocation: boolean,
  userLat: number | undefined,
  userLng: number | undefined,
  radiusMiles: number | undefined,
  supabase: ReturnType<typeof createAdminClient>,
) {
  if (!hasLocation || companies.length === 0) {
    return apiResponse({ companies });
  }

  const companyIds = companies.map((c: any) => c.id);

  const { data, error } = await supabase.rpc("nearby_companies", {
    user_lat: userLat!,
    user_lng: userLng!,
    radius_miles: radiusMiles ?? null,
    search_text: null,
    company_ids: companyIds,
    page_num: 1,
    page_size: companyIds.length,
  });

  if (error) throw error;

  const distanceByCompany: Record<string, number> = {};
  const nearbyIds = new Set<string>();

  for (const row of (data || []) as any[]) {
    distanceByCompany[row.id] = row.distance_miles;
    nearbyIds.add(row.id);
  }

  // Merge capabilities back: the RPC returns raw company columns,
  // but we already have capabilities attached — build a lookup.
  const capLookup = new Map<string, any[]>();
  for (const c of companies) {
    capLookup.set(c.id, c.capabilities || []);
  }

  const sortedCompanies = (data || []).map((row: any) => ({
    ...row,
    capabilities: capLookup.get(row.id) || [],
  }));

  return apiResponse({
    companies: sortedCompanies,
    distanceByCompany,
  });
}
