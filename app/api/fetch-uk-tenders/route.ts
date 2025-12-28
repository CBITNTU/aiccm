import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  createAdminClient,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { Database } from "@/lib/supabase/types";

const FIND_TENDER_API_BASE = "https://www.find-tender.service.gov.uk/api/1.0";

interface TenderData {
  id?: string;
  ocid?: string;
  reference_number: string;
  title: string;
  buyer: string;
  cpv_codes: string[];
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  location: string;
  deadline: string | null;
  status: string;
  publication_date: string;
  contact_info: unknown;
  requirements?: unknown;
  documents?: unknown;
  external_id?: string;
  source?: string;
}

// Transform OCDS release data to our tender format
function transformOCDSToTender(
  release: Record<string, unknown>,
  ocid: string
): TenderData {
  const tender = (release.tender || {}) as Record<string, unknown>;
  const parties = (release.parties || []) as Array<Record<string, unknown>>;
  const buyer = parties.find((p) =>
    (p.roles as string[] | undefined)?.includes("buyer")
  );

  // Extract notice ID from release.id
  const noticeId =
    (release.id as string) ||
    ocid.replace("ocds-h6vhtk-", "").replace("-integration", "");

  // Convert budget values properly
  const convertBudget = (value: unknown): number | null => {
    if (!value || value === 0) return null;
    const numValue = Number(value);
    if (isNaN(numValue)) return null;
    return Math.floor(numValue * 100);
  };

  // Extract ALL CPV codes comprehensively
  const cpvSet = new Set<string>();

  const items = tender.items as Array<Record<string, unknown>> | undefined;
  if (items && Array.isArray(items)) {
    items.forEach((item) => {
      const classification = item.classification as
        | Record<string, unknown>
        | undefined;
      if (classification?.id) {
        cpvSet.add(classification.id as string);
      }
      const additionalClassifications = item.additionalClassifications as
        | Array<Record<string, unknown>>
        | undefined;
      if (
        additionalClassifications &&
        Array.isArray(additionalClassifications)
      ) {
        additionalClassifications.forEach((ac) => {
          if (ac.id && (ac.scheme === "CPV" || !ac.scheme)) {
            cpvSet.add(ac.id as string);
          }
        });
      }
    });
  }

  // Fallback to tender-level classification
  const tenderClassification = tender.classification as
    | Record<string, unknown>
    | undefined;
  if (cpvSet.size === 0 && tenderClassification?.id) {
    cpvSet.add(tenderClassification.id as string);
  }

  const cpvCodes = Array.from(cpvSet);

  const tenderPeriod = tender.tenderPeriod as
    | Record<string, unknown>
    | undefined;
  const enquiryPeriod = tender.enquiryPeriod as
    | Record<string, unknown>
    | undefined;
  const tenderValue = tender.value as Record<string, unknown> | undefined;
  const minValue = tender.minValue as Record<string, unknown> | undefined;
  const maxValue = tender.maxValue as Record<string, unknown> | undefined;
  const deliveryLocation = tender.deliveryLocation as
    | Record<string, unknown>
    | undefined;
  const buyerContactPoint = buyer?.contactPoint as
    | Record<string, unknown>
    | undefined;

  return {
    id: (release.id as string) || ocid,
    reference_number: (release.id as string) || ocid,
    title: (tender.title as string) || "Untitled Tender",
    description:
      (tender.description as string) || (release.description as string) || "",
    buyer: (buyer?.name as string) || "Unknown Buyer",
    location: (deliveryLocation?.description as string) || "United Kingdom",
    status:
      tender.status === "active" ? "open" : (tender.status as string) || "open",
    publication_date: (release.date as string) || new Date().toISOString(),
    deadline:
      (tenderPeriod?.endDate as string) ||
      (enquiryPeriod?.endDate as string) ||
      null,
    budget_min: convertBudget(tenderValue?.amount || minValue?.amount),
    budget_max: convertBudget(tenderValue?.amount || maxValue?.amount),
    cpv_codes: cpvCodes,
    contact_info: {
      email: buyerContactPoint?.email || null,
      phone: buyerContactPoint?.telephone || null,
      organization: (buyer?.name as string) || "Unknown Buyer",
    },
    source: "find_tender",
    external_id: noticeId,
    ocid: ocid,
  };
}

async function fetchFromFindTenderAPI(
  searchTerm?: string,
  limit = 100,
  cursor?: string,
  isAdmin = false,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();

  // For admins, allow unlimited fetching by using maximum API limit
  if (isAdmin) {
    params.append("limit", "100");
  } else {
    params.append("limit", Math.min(limit, 50).toString());
  }

  params.append("stages", "tender");

  if (cursor) {
    params.append("cursor", cursor);
  }

  // Apply date filters if provided
  if (filters?.dateFrom) {
    params.append(
      "updatedFrom",
      new Date(filters.dateFrom as string).toISOString().slice(0, 19)
    );
  } else {
    // Default to last 30 days if no date filter
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.append("updatedFrom", thirtyDaysAgo.toISOString().slice(0, 19));
  }

  if (filters?.dateTo) {
    params.append(
      "updatedTo",
      new Date(filters.dateTo as string).toISOString().slice(0, 19)
    );
  }

  const url = `${FIND_TENDER_API_BASE}/ocdsReleasePackages?${params.toString()}`;

  console.log("Fetching from Find a Tender API:", url, `(Admin: ${isAdmin})`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TenderMatchingService/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Find a Tender API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  console.log(
    `Received ${
      data.releases?.length || 0
    } releases from API (Admin: ${isAdmin})`
  );

  return data;
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      console.error("No authorization header provided");
      return apiError("Authorization required", 401);
    }

    console.log("Authenticated user:", user.id);

    // Check if user has superadmin role
    const isAdmin = await checkSuperadminRole(user.id);

    const {
      searchTerm,
      limit = 100,
      cursor,
      adminImport = false,
      filters,
    } = await request.json();

    // If this is an admin import request, check admin permissions
    if (adminImport && !isAdmin) {
      return apiError("Superadmin access required to import tenders", 403);
    }

    // Fetch from real Find a Tender API with admin privileges and filters
    const ocdsData = await fetchFromFindTenderAPI(
      searchTerm,
      limit,
      cursor,
      isAdmin,
      filters
    );

    // Transform OCDS releases to our tender format
    let tenders: TenderData[] = [];
    const releases = ocdsData.releases as
      | Array<Record<string, unknown>>
      | undefined;
    if (releases && releases.length > 0) {
      tenders = releases.map((release) =>
        transformOCDSToTender(release, release.ocid as string)
      );
    }

    // Apply additional filters to transformed data
    let filteredTenders = tenders;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredTenders = tenders.filter(
        (tender) =>
          tender.title.toLowerCase().includes(searchLower) ||
          tender.description.toLowerCase().includes(searchLower) ||
          tender.buyer.toLowerCase().includes(searchLower) ||
          tender.location.toLowerCase().includes(searchLower)
      );
    }

    // Budget filter
    if (filters?.budgetMin || filters?.budgetMax) {
      filteredTenders = filteredTenders.filter((tender) => {
        const tenderBudget = tender.budget_max || tender.budget_min || 0;
        if (filters.budgetMin && tenderBudget < (filters.budgetMin as number))
          return false;
        if (filters.budgetMax && tenderBudget > (filters.budgetMax as number))
          return false;
        return true;
      });
    }

    console.log(
      `Returning ${filteredTenders.length} tenders from Find a Tender API (admin: ${isAdmin}, total fetched: ${tenders.length})`
    );

    // If admin is importing, also save to database with duplicate prevention
    if (adminImport && isAdmin && filteredTenders.length > 0) {
      const supabase = createAdminClient();

      const tendersToInsert = filteredTenders.map((tender) => ({
        reference_number: tender.reference_number,
        title: tender.title,
        buyer: tender.buyer,
        cpv_codes: tender.cpv_codes,
        description: tender.description,
        budget_min: tender.budget_min,
        budget_max: tender.budget_max,
        location: tender.location,
        deadline: tender.deadline,
        status: tender.status,
        publication_date: tender.publication_date,
        contact_info: tender.contact_info,
        requirements: {
          sectors: tender.cpv_codes,
          location: tender.location.split(",")[1]?.trim() || "UK",
          deadline: tender.deadline,
        },
        documents: {
          specification_url: `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`,
          application_url: `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`,
        },
      }));

      // Check for existing tenders to avoid duplicates
      const { data: existingTenders } = await supabase
        .from("tenders")
        .select("reference_number, id")
        .in(
          "reference_number",
          tendersToInsert.map((t) => t.reference_number)
        );

      const existingRefs = new Map(
        existingTenders?.map((t) => [t.reference_number, t.id]) || []
      );
      const newTenders = tendersToInsert.filter(
        (t) => !existingRefs.has(t.reference_number)
      );

      if (newTenders.length > 0) {
        const { data: insertedTenders, error: insertError } = await supabase
          .from("tenders")
          .upsert(
            newTenders as unknown as Database["public"]["Tables"]["tenders"]["Insert"][],
            { onConflict: "reference_number" }
          )
          .select(
            "id, reference_number, title, description, buyer, cpv_codes, location"
          );

        if (insertError) {
          console.error("Error importing tenders:", insertError);
        } else {
          console.log(
            `Successfully imported ${newTenders.length} new tenders to database`
          );

          // Note: Auto-tagging with AI would require calling the analyze-tender API route
          // This can be done asynchronously or in a separate background job
          if (insertedTenders && insertedTenders.length > 0) {
            console.log(
              `${insertedTenders.length} tenders ready for AI analysis`
            );
            // Auto-tagging can be triggered here by calling /api/analyze-tender for each
          }
        }
      } else {
        console.log("No new tenders to import - all were duplicates");
      }
    }

    // Extract pagination info from OCDS response
    const links = ocdsData.links as
      | Record<string, { href?: string }>
      | undefined;
    const nextCursor = links?.next?.href
      ? new URL(links.next.href).searchParams.get("cursor")
      : null;

    return apiResponse({
      tenders: filteredTenders,
      total: filteredTenders.length,
      totalFetched: tenders.length,
      hasMore: !!nextCursor && isAdmin,
      nextCursor: isAdmin ? nextCursor : null,
      isAdmin,
      source: "find_tender_api",
      duplicatesSkipped: adminImport
        ? tenders.length - filteredTenders.length
        : 0,
    });
  } catch (error) {
    console.error("Error in fetch-uk-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return apiResponse(
      {
        error: message,
        tenders: [],
        total: 0,
        page: 1,
        totalPages: 0,
        isAdmin: false,
        message: "Unable to fetch tenders. Please try again later.",
      },
      500
    );
  }
}
