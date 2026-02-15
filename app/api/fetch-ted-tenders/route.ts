import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  createAdminClient,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { Database } from "@/lib/supabase/types";

const TED_API_BASE = "https://api.ted.europa.eu/v3";

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

// Transform TED notice data to our tender format
// TED uses eForms structure with field names like "BT-01-notice", "notice-title", etc.
function transformTEDToTender(notice: Record<string, unknown>): TenderData {
  // Extract notice identifier
  const noticeIdentifier =
    (notice["notice-identifier"] as string) ||
    (notice["BT-01-notice"] as string) ||
    "";

  // Extract title - can be in multiple fields
  const titleObj = notice["notice-title"] as { lang?: string } | undefined;
  const title =
    typeof titleObj === "object" && titleObj !== null && "lang" in titleObj
      ? (titleObj.lang as string) || ""
      : (notice["BT-01-notice"] as string) || "Untitled Tender";

  // Extract description
  const descriptionObj = notice["description-glo"] as
    | { lang?: string[] }
    | undefined;
  const description =
    typeof descriptionObj === "object" &&
    descriptionObj !== null &&
    "lang" in descriptionObj
      ? (descriptionObj.lang as string[])?.join(" ") || ""
      : "";

  // Extract buyer information
  const buyerNameObj = notice["buyer-name"] as { lang?: string[] } | undefined;
  const buyer =
    typeof buyerNameObj === "object" &&
    buyerNameObj !== null &&
    "lang" in buyerNameObj
      ? (buyerNameObj.lang as string[])?.join(", ") || "Unknown Buyer"
      : "Unknown Buyer";

  // Extract location - try multiple fields
  const placeOfPerformance = notice["place-of-performance-country-lot"] as
    | string[]
    | undefined;
  const location =
    placeOfPerformance?.join(", ") ||
    (notice["buyer-country"] as string[])?.join(", ") ||
    "EU";

  // Extract CPV codes
  const cpvCodes: string[] = [];
  const mainCpv = notice["main-classification-lot"] as string[] | undefined;
  if (mainCpv) cpvCodes.push(...mainCpv);

  const additionalCpv = notice["additional-classification-lot"] as
    | string[]
    | undefined;
  if (additionalCpv) {
    cpvCodes.push(...additionalCpv);
  }

  // Extract budget - TED uses estimated-value-lot
  const estimatedValue = notice["estimated-value-lot"] as number[] | undefined;
  const budgetMin = estimatedValue?.[0]
    ? Math.floor(estimatedValue[0] * 100)
    : null; // Convert to cents
  const budgetMax = estimatedValue?.[1]
    ? Math.floor(estimatedValue[1] * 100)
    : null;

  // Extract dates
  const publicationDate =
    (notice["publication-date"] as string[])?.join("") ||
    new Date().toISOString();
  const deadlineDate =
    (notice["deadline-date-lot"] as string[])?.join("") || undefined;

  // Extract status - TED uses scope (ACTIVE, ARCHIVED)
  const status = "active"; // All results from ACTIVE scope

  // Extract contact info
  const buyerEmail =
    (notice["buyer-email"] as string[])?.join(", ") || undefined;
  const buyerContact =
    (notice["buyer-contact-point"] as string[])?.join(", ") || undefined;

  const contactInfo = {
    email: buyerEmail,
    phone: undefined,
    organization: buyer,
    contactPoint: buyerContact,
  };

  // Build notice URL
  const noticeUrl = noticeIdentifier
    ? `https://ted.europa.eu/udl?uri=TED:NOTICE:${noticeIdentifier}`
    : "https://ted.europa.eu";

  return {
    reference_number: noticeIdentifier,
    title: title || "Untitled Tender",
    buyer: buyer,
    cpv_codes: cpvCodes.length > 0 ? cpvCodes : [],
    description: description || "",
    budget_min: budgetMin,
    budget_max: budgetMax,
    location: location,
    deadline: deadlineDate || null,
    status: status,
    publication_date: publicationDate,
    contact_info: contactInfo,
    requirements: {
      sectors: cpvCodes,
      location: location,
      deadline: deadlineDate,
    },
    documents: {
      specification_url: noticeUrl,
      application_url: noticeUrl,
    },
    external_id: noticeIdentifier,
    source: "ted",
  };
}

async function fetchFromTEDAPI(
  dateFrom?: string,
  dateTo?: string,
  page: number = 1,
  limit: number = 100,
  iterationNextToken?: string,
  isAdmin = false,
): Promise<{
  notices: TenderData[];
  total: number;
  hasMore: boolean;
  nextToken?: string;
}> {
  // Note: Search API does NOT require authentication according to documentation
  // But we'll keep the API key check for other potential uses

  const url = `${TED_API_BASE}/notices/search`;

  // Build query string for date filtering
  // TED API expert query syntax: dates in YYYYMMDD, field names use hyphens (e.g. publication-date).
  // Bare "*" is invalid; use a date range or other TERM expression.

  // Helper function to convert date to YYYYMMDD format
  const formatDateForTED = (dateStr: string): string => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  // TED expert query does NOT accept bare "*". Must use a TERM e.g. date range (YYYYMMDD).
  const DEFAULT_FROM = "19900101";
  let builtQuery = `publication-date >= ${DEFAULT_FROM}`;
  if (dateFrom || dateTo) {
    try {
      const parts: string[] = [];
      if (dateFrom) parts.push(`publication-date >= ${formatDateForTED(dateFrom)}`);
      if (dateTo) parts.push(`publication-date <= ${formatDateForTED(dateTo)}`);
      if (parts.length > 0) builtQuery = parts.join(" AND ");
    } catch {
      // keep builtQuery as default
    }
  }

  const fields = [
    "notice-identifier",
    "notice-title",
    "description-glo",
    "buyer-name",
    "buyer-country",
    "place-of-performance-country-lot",
    "main-classification-lot",
    "additional-classification-lot",
    "estimated-value-lot",
    "publication-date",
    "deadline-date-lot",
    "buyer-email",
    "buyer-contact-point",
  ];

  if (builtQuery === "*" || (builtQuery && builtQuery.trim() === "*")) {
    builtQuery = `publication-date >= ${DEFAULT_FROM}`;
  }
  const requestBody: Record<string, unknown> = {
    query: builtQuery,
    fields,
    page: page,
    limit: Math.min(limit, 250), // Max 250 per TED Search API (Swagger)
    scope: "ACTIVE", // ACTIVE, ARCHIVED, or ALL
    checkQuerySyntax: true, // Enable syntax checking to get better errors
    paginationMode: iterationNextToken ? "ITERATION" : "PAGE_NUMBER",
    onlyLatestVersions: true, // Only get latest versions
  };

  // Add iteration token if provided (for pagination)
  if (iterationNextToken) {
    requestBody.iterationNextToken = iterationNextToken;
    requestBody.paginationMode = "ITERATION";
  }

  console.log("[TED] query=", builtQuery, "| never * | Admin:", isAdmin, "Page:", page);
  console.log("TED API Request Body:", JSON.stringify(requestBody, null, 2));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "TenderMatchingService/1.0",
  };
  if (process.env.TED_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.TED_API_KEY}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const error: Error & { status?: number } = new Error(
        `Rate limited (429): ${response.statusText}. Please wait before retrying.`,
      );
      error.status = 429;
      throw error;
    }
    const errorText = await response.text();
    let errorMessage = `TED API error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.type === "QUERY_SYNTAX_ERROR") {
        const location = errorJson.location || {};
        errorMessage = `Query syntax error at line ${location.beginLine || "?"}, column ${location.beginColumn || "?"}. Query: "${builtQuery}". Full error: ${JSON.stringify(errorJson)}`;
        console.error("TED Query Syntax Error:", errorJson);
        console.error("Query used:", builtQuery);
      } else if (errorJson.message) {
        errorMessage = errorJson.message;
      } else {
        errorMessage = JSON.stringify(errorJson);
      }
    } catch {
      // If error text is not JSON, use it as is
      if (errorText) errorMessage += `. ${errorText}`;
    }
    console.error("TED API Error Details:", {
      status: response.status,
      statusText: response.statusText,
      errorText,
      query: builtQuery,
    });
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    notices?: Array<Record<string, unknown>>;
    totalNoticeCount?: number;
    iterationNextToken?: string;
  };

  // Extract notices from response
  const notices = (data.notices || []) as Array<Record<string, unknown>>;
  const total = data.totalNoticeCount || notices.length;
  const nextToken = data.iterationNextToken;
  const hasMore = !!nextToken || notices.length >= limit;

  console.log(
    `Received ${notices.length} notices from TED API (Admin: ${isAdmin}, Total: ${total}, HasMore: ${hasMore})`,
  );

  const transformedTenders = notices.map((notice) =>
    transformTEDToTender(notice),
  );

  return {
    notices: transformedTenders,
    total: total as number,
    hasMore,
    nextToken,
  };
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
      const { user: authUser, error: authError } = await getAuthenticatedUser(request);
      user = authUser;
      if (authError || !user) {
        return apiError("Authentication required", 401);
      }
      console.log("Authenticated user:", user.id);
      isAdmin = await checkSuperadminRole(user.id);
      if (!isAdmin) {
        return apiError("Superadmin access required", 403);
      }
    }

    const {
      dateFrom,
      dateTo,
      page = 1,
      limit = 100,
      iterationNextToken,
      adminImport = false,
    } = await request.json();

    // Fetch from TED API
    const { notices, hasMore, nextToken } = await fetchFromTEDAPI(
      dateFrom,
      dateTo,
      page,
      limit,
      iterationNextToken,
      isAdmin,
    );

    // If admin is importing, also save to database with duplicate prevention
    if (adminImport && isAdmin && notices.length > 0) {
      const supabase = createAdminClient();

      const tendersToInsert = notices.map((tender) => ({
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
        requirements: tender.requirements,
        documents: tender.documents,
      }));

      // Check for existing tenders to avoid duplicates
      const { data: existingTenders } = await supabase
        .from("tenders")
        .select("reference_number, id")
        .in(
          "reference_number",
          tendersToInsert.map((t) => t.reference_number),
        );

      const existingRefs = new Map(
        existingTenders?.map((t) => [t.reference_number, t.id]) || [],
      );
      const newTenders = tendersToInsert.filter(
        (t) => !existingRefs.has(t.reference_number),
      );
      const duplicatesCount = tendersToInsert.length - newTenders.length;

      if (newTenders.length > 0) {
        const { data: insertedTenders, error: insertError } = await supabase
          .from("tenders")
          .upsert(
            newTenders as unknown as Database["public"]["Tables"]["tenders"]["Insert"][],
            { onConflict: "reference_number" },
          )
          .select(
            "id, reference_number, title, description, buyer, cpv_codes, location",
          );

        if (insertError) {
          console.error("Error importing tenders:", insertError);
        } else {
          console.log(
            `Successfully imported ${newTenders.length} new tenders to database (${duplicatesCount} duplicates skipped)`,
          );

          // Log tender import event
          await logApiEvent(request, {
            actionType: "admin_tender_imported",
            userId: user?.id ?? null,
            userEmail: user?.email ?? undefined,
            details: {
              source: "ted_api",
              importedCount: newTenders.length,
              duplicatesSkipped: duplicatesCount,
              totalFetched: notices.length,
            },
          }).catch(() => {}); // Don't fail if logging fails

          // Queue AI processing jobs for new tenders
          if (insertedTenders && insertedTenders.length > 0) {
            const { enqueueBatch } =
              await import("@/lib/services/queueService");
            const tenderIds = (
              (insertedTenders as unknown as { id: string }[]) || []
            ).map((t) => t.id);

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
              // Don't fail the import if queueing fails
            }
          }
        }
      } else {
        console.log(
          `No new tenders to import - all ${tendersToInsert.length} were duplicates`,
        );
      }

      // Return actual imported count
      const actuallyImported = newTenders.length;

      return apiResponse({
        tenders: notices,
        total: notices.length,
        totalFetched: notices.length,
        actuallyImported: actuallyImported,
        hasMore: hasMore && isAdmin,
        nextPage: hasMore && isAdmin ? page + 1 : null,
        nextToken: hasMore && isAdmin ? nextToken : null,
        isAdmin,
        source: "ted_api",
        duplicatesSkipped: duplicatesCount,
        ...(notices.length === 0 && {
          message:
            "TED returned no notices for this date range. Try a wider range or add TED_API_KEY to .env.local (optional; see https://docs.ted.europa.eu/api/latest/).",
        }),
      });
    }

    return apiResponse({
      tenders: notices,
      total: notices.length,
      totalFetched: notices.length,
      hasMore: hasMore && isAdmin,
      nextPage: hasMore && isAdmin ? page + 1 : null,
      nextToken: hasMore && isAdmin ? nextToken : null,
      isAdmin,
      source: "ted_api",
      duplicatesSkipped: 0,
      ...(notices.length === 0 && {
        message:
          "TED returned no notices for this date range. Try a wider range or add TED_API_KEY to .env.local (optional; see https://docs.ted.europa.eu/api/latest/).",
      }),
    });
  } catch (error) {
    console.error("Error in fetch-ted-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return apiResponse(
      {
        error: message,
        tenders: [],
        total: 0,
        page: 1,
        totalPages: 0,
        hasMore: false,
        isAdmin: false,
        source: "ted_api",
      },
      500,
    );
  }
}
