import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { haversineDistanceMiles } from "@/lib/geocode";

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

            // Fetch capabilities for each company
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

            // Apply location filtering to fallback results too
            if (hasLocation) {
              const distanceByCompany: Record<string, number> = {};
              const withDist = companiesWithCapabilities.map((c: any) => ({
                company: c,
                distance: haversineDistanceMiles(
                  c.latitude ?? null, c.longitude ?? null,
                  userLat!, userLng!,
                ),
              }));
              let filt = withDist;
              if (radiusMiles != null && !isNaN(radiusMiles)) {
                filt = withDist.filter((i) => i.distance != null && i.distance <= radiusMiles);
              }
              filt.sort((a, b) => {
                if (a.distance == null && b.distance == null) return 0;
                if (a.distance == null) return 1;
                if (b.distance == null) return -1;
                return a.distance - b.distance;
              });
              for (const i of filt) {
                if (i.distance != null) {
                  distanceByCompany[i.company.id] = Math.round(i.distance * 10) / 10;
                }
              }
              return apiResponse({
                companies: filt.map((i) => i.company),
                distanceByCompany,
              });
            }
            return apiResponse({ companies: companiesWithCapabilities });
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

    // Fetch capabilities for each company
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

    // Apply location filtering and sorting if coordinates provided
    if (hasLocation) {
      const distanceByCompany: Record<string, number> = {};

      const withDistance = companiesWithCapabilities.map((c: any) => ({
        company: c,
        distance: haversineDistanceMiles(
          c.latitude ?? null,
          c.longitude ?? null,
          userLat!,
          userLng!,
        ),
      }));

      let filtered = withDistance;
      if (radiusMiles != null && !isNaN(radiusMiles)) {
        filtered = withDistance.filter(
          (item) => item.distance != null && item.distance <= radiusMiles,
        );
      }

      filtered.sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });

      for (const item of filtered) {
        if (item.distance != null) {
          distanceByCompany[item.company.id] =
            Math.round(item.distance * 10) / 10;
        }
      }

      return apiResponse({
        companies: filtered.map((item) => item.company),
        distanceByCompany,
      });
    }

    return apiResponse({ companies: companiesWithCapabilities });
  } catch (error) {
    return handleApiError(error);
  }
}
