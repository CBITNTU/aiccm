import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { inArray } from "drizzle-orm";

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
  contact_info: Record<string, unknown> | null;
  requirements?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  external_id?: string;
  source?: string;
}

type TenderInsert = typeof tenders.$inferInsert;

function mapTenderToInsert(tender: TenderData): TenderInsert {
  return {
    referenceNumber: tender.reference_number,
    title: tender.title,
    buyer: tender.buyer,
    cpvCodes: tender.cpv_codes,
    description: tender.description,
    budgetMin: tender.budget_min,
    budgetMax: tender.budget_max,
    location: tender.location,
    deadline: tender.deadline ? new Date(tender.deadline) : null,
    status: tender.status,
    publicationDate: tender.publication_date
      ? new Date(tender.publication_date)
      : new Date(),
    contactInfo: tender.contact_info,
    requirements: tender.requirements ?? {
      sectors: tender.cpv_codes,
      location: tender.location.split(",")[1]?.trim() || "UK",
      deadline: tender.deadline,
    },
    documents: tender.documents ?? {
      specification_url: `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`,
      application_url: `https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`,
    },
  };
}

// Transform OCDS release data to our tender format
function transformOCDSToTender(
  release: Record<string, unknown>,
  ocid: string,
): TenderData {
  const tender = (release.tender || {}) as Record<string, unknown>;
  const parties = (release.parties || []) as Array<Record<string, unknown>>;
  const buyer = parties.find((p) =>
    (p.roles as string[] | undefined)?.includes("buyer"),
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
  filters?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();

  if (isAdmin) {
    params.append("limit", "100");
  } else {
    params.append("limit", Math.min(limit, 50).toString());
  }

  params.append("stages", "tender");

  if (cursor) {
    params.append("cursor", cursor);
  }

  if (filters?.dateFrom) {
    params.append(
      "updatedFrom",
      new Date(filters.dateFrom as string).toISOString().slice(0, 19),
    );
  } else {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.append("updatedFrom", thirtyDaysAgo.toISOString().slice(0, 19));
  }

  if (filters?.dateTo) {
    params.append(
      "updatedTo",
      new Date(filters.dateTo as string).toISOString().slice(0, 19),
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
    if (response.status === 429) {
      const error: Error & { status?: number } = new Error(
        `Rate limited (429): ${response.statusText}. Please wait before retrying.`,
      );
      error.status = 429;
      throw error;
    }
    throw new Error(
      `Find a Tender API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const releasesCount = data.releases?.length || 0;
  console.log(
    `Received ${releasesCount} releases from API (Admin: ${isAdmin})`,
  );

  if (data.links?.next) {
    console.log("Next page available:", data.links.next.href);
  } else {
    console.log("No more pages available");
  }

  return data;
}

const TENDER_SYNC_SECRET = process.env.TENDER_SYNC_SECRET || process.env.CRON_SECRET;

function isTenderSyncRequest(request: NextRequest): boolean {
  const secret = request.headers.get("X-Tender-Sync-Secret");
  return !!TENDER_SYNC_SECRET && secret === TENDER_SYNC_SECRET;
}

export async function POST(request: NextRequest) {
  try {
    const syncBySecret = isTenderSyncRequest(request);
    let user: { id: string; email?: string | null } | null = null;
    let isAdmin = false;

    if (syncBySecret) {
      isAdmin = true;
      console.log("Tender sync: authenticated via X-Tender-Sync-Secret");
    } else {
      const auth = await getAuthenticatedUser(request);
      user = auth.user;
      if (!user) {
        console.error("No authorization header provided");
        return apiError("Authorization required", 401);
      }
      console.log("Authenticated user:", user.id);
      isAdmin = await checkSuperadminRole(user.id);
    }

    const {
      searchTerm,
      limit = 100,
      cursor,
      adminImport = false,
      filters,
    } = await request.json();

    if (adminImport && !isAdmin) {
      return apiError("Superadmin access required to import tenders", 403);
    }

    // Fetch from real Find a Tender API with admin privileges and filters
    const ocdsData = await fetchFromFindTenderAPI(
      searchTerm,
      limit,
      cursor,
      isAdmin,
      filters,
    );

    // Transform OCDS releases to our tender format
    let tendersData: TenderData[] = [];
    const releases = ocdsData.releases as
      | Array<Record<string, unknown>>
      | undefined;
    if (releases && releases.length > 0) {
      tendersData = releases.map((release) =>
        transformOCDSToTender(release, release.ocid as string),
      );
    }

    // Apply additional filters to transformed data
    let filteredTenders = tendersData;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredTenders = tendersData.filter(
        (tender) =>
          tender.title.toLowerCase().includes(searchLower) ||
          tender.description.toLowerCase().includes(searchLower) ||
          tender.buyer.toLowerCase().includes(searchLower) ||
          tender.location.toLowerCase().includes(searchLower),
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
      `Returning ${filteredTenders.length} tenders from Find a Tender API (admin: ${isAdmin}, total fetched: ${tendersData.length})`,
    );

    // If admin is importing, also save to database with duplicate prevention
    if (adminImport && isAdmin && filteredTenders.length > 0) {
      const tendersToInsert: TenderInsert[] = filteredTenders.map(mapTenderToInsert);

      // Check for existing tenders to avoid duplicates
      const refNumbers = tendersToInsert.map((t) => t.referenceNumber).filter(Boolean) as string[];
      let existingRefs = new Map<string | null, string>();

      if (refNumbers.length > 0) {
        const existingTenders = await db
          .select({ referenceNumber: tenders.referenceNumber, id: tenders.id })
          .from(tenders)
          .where(inArray(tenders.referenceNumber, refNumbers));

        existingRefs = new Map(
          existingTenders.map((t) => [t.referenceNumber, t.id]),
        );
      }

      const newTenders = tendersToInsert.filter(
        (t) => !existingRefs.has(t.referenceNumber),
      );
      const duplicatesCount = tendersToInsert.length - newTenders.length;

      if (newTenders.length > 0) {
        try {
          const insertedTenders = await db
            .insert(tenders)
            .values(newTenders)
            .onConflictDoNothing()
            .returning({
              id: tenders.id,
              referenceNumber: tenders.referenceNumber,
              title: tenders.title,
              description: tenders.description,
              buyer: tenders.buyer,
              cpvCodes: tenders.cpvCodes,
              location: tenders.location,
            });

          console.log(
            `Successfully imported ${newTenders.length} new tenders to database (${duplicatesCount} duplicates skipped)`,
          );

          // Log tender import event
          await logApiEvent(request, {
            actionType: "admin_tender_imported",
            userId: user?.id ?? null,
            userEmail: user?.email ?? undefined,
            details: {
              source: "find_tender_api",
              importedCount: newTenders.length,
              duplicatesSkipped: duplicatesCount,
              totalFetched: tendersData.length,
            },
          }).catch(() => {});

          // Queue AI processing jobs for new tenders
          if (insertedTenders && insertedTenders.length > 0) {
            console.log(
              `${insertedTenders.length} tenders ready for AI analysis`,
            );

            const { enqueueBatch } =
              await import("@/lib/services/queueService");
            const tenderIds = insertedTenders.map((t) => t.id);

            const jobs = tenderIds.map((tenderId) => ({
              jobType: "tender_ai_complete" as const,
              entityType: "tender" as const,
              entityId: tenderId,
              priority: 5,
            }));

            try {
              await enqueueBatch(jobs, "tender_ai_regeneration", user?.id ?? undefined);
              console.log(
                `Queued ${jobs.length} AI processing jobs for ${tenderIds.length} new tenders`,
              );
            } catch (queueError) {
              console.error("Failed to queue AI processing jobs:", queueError);
            }
          }
        } catch (insertError) {
          console.error("Error importing tenders:", insertError);
        }
      } else {
        console.log(
          `No new tenders to import - all ${tendersToInsert.length} were duplicates`,
        );
      }

      // Extract pagination info from OCDS response
      const links = ocdsData.links as
        | Record<string, string | { href?: string }>
        | undefined;

      let nextCursor: string | null = null;

      const nextUrlString =
        typeof links?.next === "string"
          ? links.next
          : (links?.next as { href?: string })?.href;

      if (nextUrlString) {
        try {
          const nextUrl = new URL(nextUrlString);
          nextCursor = nextUrl.searchParams.get("cursor");
          console.log(
            "Extracted nextCursor:",
            nextCursor?.substring(0, 50) + "...",
          );
        } catch (e) {
          console.error("Error parsing next URL:", e, nextUrlString);
        }
      }

      const actuallyImported = newTenders.length;

      const gotMaxResults = tendersData.length >= 100;
      const hasMorePages = (!!nextCursor || gotMaxResults) && isAdmin;

      console.log(
        `Pagination: hasMore=${hasMorePages}, nextCursor=${nextCursor}, gotMaxResults=${gotMaxResults}, isAdmin=${isAdmin}, tenders.length=${tendersData.length}`,
      );

      return apiResponse({
        tenders: filteredTenders,
        total: filteredTenders.length,
        totalFetched: tendersData.length,
        actuallyImported: actuallyImported,
        hasMore: hasMorePages,
        nextCursor: isAdmin ? nextCursor : null,
        isAdmin,
        source: "find_tender_api",
        duplicatesSkipped: duplicatesCount,
      });
    }

    // Extract pagination info from OCDS response (when not importing)
    const links = ocdsData.links as
      | Record<string, string | { href?: string }>
      | undefined;

    let nextCursor: string | null = null;

    const nextUrlString =
      typeof links?.next === "string"
        ? links.next
        : (links?.next as { href?: string })?.href;

    if (nextUrlString) {
      try {
        const nextUrl = new URL(nextUrlString);
        nextCursor = nextUrl.searchParams.get("cursor");
      } catch (e) {
        console.error("Error parsing next URL (non-import):", e, nextUrlString);
      }
    }

    return apiResponse({
      tenders: filteredTenders,
      total: filteredTenders.length,
      totalFetched: tendersData.length,
      hasMore: !!nextCursor && isAdmin,
      nextCursor: isAdmin ? nextCursor : null,
      isAdmin,
      source: "find_tender_api",
      duplicatesSkipped: 0,
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
      500,
    );
  }
}
