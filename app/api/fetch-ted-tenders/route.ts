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
  contact_info: Record<string, unknown> | null;
  requirements?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  external_id?: string;
  source?: string;
}

function toFeedRecord(t: TenderData) {
  return {
    id: t.id,
    ocid: t.ocid,
    referenceNumber: t.reference_number,
    title: t.title,
    buyer: t.buyer,
    cpvCodes: t.cpv_codes,
    description: t.description,
    budgetMin: t.budget_min,
    budgetMax: t.budget_max,
    location: t.location,
    deadline: t.deadline,
    status: t.status,
    publicationDate: t.publication_date,
    contactInfo: t.contact_info,
    requirements: t.requirements,
    documents: t.documents,
    externalId: t.external_id,
    source: t.source,
  };
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
    requirements: tender.requirements,
    documents: tender.documents,
  };
}

// TED API may return fields as arrays or strings; normalize to string/array safely
function toStringOrJoin(value: unknown, separator = ""): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(separator);
  return String(value);
}

function toArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/** Pick the first element when TED returns an array (e.g. one date per lot). */
function toFirst(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  return String(value);
}

/** Parse a TED date value into a valid ISO-8601 string, or null on failure. */
function parseTEDDate(value: unknown): string | null {
  const raw = toFirst(value);
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Extract text from a TED multilingual field.
 * TED returns objects keyed by language code: {"eng": ["text"], "fra": ["texte"]}
 * or sometimes {"eng": "text"}.  We prefer English, then fall back to first available.
 */
function extractLocalised(
  obj: unknown,
  preferredLangs: string[] = ["eng", "en", "ENG"],
): string {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object" || Array.isArray(obj)) return toStringOrJoin(obj, " ");
  const map = obj as Record<string, unknown>;
  // Try preferred languages in order
  for (const lang of preferredLangs) {
    if (map[lang] != null) {
      const val = map[lang];
      if (Array.isArray(val)) return val.map(String).join(" ");
      return String(val);
    }
  }
  // Fall back to first available key
  const firstKey = Object.keys(map)[0];
  if (firstKey != null) {
    const val = map[firstKey];
    if (Array.isArray(val)) return val.map(String).join(" ");
    return String(val);
  }
  return "";
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

/** TED portal URLs use publication-number (e.g. 300146-2026), not notice-identifier UUID. */
function getPublicationNumber(notice: Record<string, unknown>): string {
  return (
    firstString(notice["publication-number"]) ||
    firstString(notice["BT-01-notice"]) ||
    ""
  );
}

function getNoticeIdentifier(notice: Record<string, unknown>): string {
  return (
    firstString(notice["notice-identifier"]) ||
    firstString(notice["BT-01-notice"]) ||
    ""
  );
}

function transformTEDToTender(notice: Record<string, unknown>): TenderData {
  const noticeIdentifier = getNoticeIdentifier(notice);
  const publicationNumber = getPublicationNumber(notice);
  const portalNoticeId = publicationNumber || noticeIdentifier;

  const title =
    extractLocalised(notice["notice-title"]) ||
    (notice["BT-01-notice"] as string) ||
    "Untitled Tender";

  const description =
    extractLocalised(notice["description-lot"]) ||
    extractLocalised(notice["description-proc"]) ||
    extractLocalised(notice["description-part"]) ||
    extractLocalised(notice["description-glo"]);

  const buyer = extractLocalised(notice["buyer-name"]) || "Unknown Buyer";

  // Extract location -- deduplicate since TED returns one per lot
  const locationCodes = [
    ...new Set([
      ...toArray(notice["place-of-performance-country-lot"]),
      ...toArray(notice["buyer-country"]),
    ]),
  ];
  const location = locationCodes.length > 0 ? locationCodes.join(", ") : "EU";

  // Extract CPV codes -- deduplicate since TED returns one per lot
  const cpvCodes: string[] = [
    ...new Set([
      ...toArray(notice["main-classification-lot"]),
      ...toArray(notice["additional-classification-lot"]),
    ]),
  ];

  // Extract budget - TED uses estimated-value-lot
  const estimatedValue = notice["estimated-value-lot"] as number[] | undefined;
  const budgetMin = estimatedValue?.[0]
    ? Math.floor(estimatedValue[0] * 100)
    : null; // Convert to cents
  const budgetMax = estimatedValue?.[1]
    ? Math.floor(estimatedValue[1] * 100)
    : null;

  // Extract dates -- TED returns arrays (one per lot); pick the first valid one
  const publicationDate =
    parseTEDDate(notice["publication-date"]) || new Date().toISOString();
  const deadlineDate = parseTEDDate(notice["deadline-date-lot"]) || undefined;

  // Map to DB-valid status: open | closing_soon | framework | closed | awarded
  const status = "open";

  // Extract contact info (TED may return array or string)
  const buyerEmail = toStringOrJoin(notice["buyer-email"], ", ") || undefined;
  const buyerContact =
    toStringOrJoin(notice["buyer-contact-point"], ", ") || undefined;

  const contactInfo = {
    email: buyerEmail,
    phone: undefined,
    organization: buyer,
    contactPoint: buyerContact,
  };

  // Build notice URL using the current TED portal format. The legacy
  // `/udl?uri=TED:NOTICE:` URLs no longer resolve on the new TED EU site.
  const noticeUrl = portalNoticeId
    ? `https://ted.europa.eu/en/notice/-/detail/${portalNoticeId}`
    : "https://ted.europa.eu";

  return {
    reference_number: portalNoticeId,
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
    external_id: noticeIdentifier || portalNoticeId,
    source: "ted",
  };
}

/** ISO 639-3 language codes accepted by TED `official-language` field. */
const TED_DEFAULT_LANGUAGES = ["ENG"];

async function fetchFromTEDAPI(
  dateFrom?: string,
  dateTo?: string,
  page: number = 1,
  limit: number = 100,
  iterationNextToken?: string,
  isAdmin = false,
  languages: string[] = TED_DEFAULT_LANGUAGES,
): Promise<{
  notices: TenderData[];
  total: number;
  hasMore: boolean;
  nextToken?: string;
}> {
  const url = `${TED_API_BASE}/notices/search`;

  const formatDateForTED = (dateStr: string): string => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  };

  const DEFAULT_FROM = "19900101";
  const queryParts: string[] = [];

  if (dateFrom || dateTo) {
    try {
      if (dateFrom) queryParts.push(`publication-date >= ${formatDateForTED(dateFrom)}`);
      if (dateTo) queryParts.push(`publication-date <= ${formatDateForTED(dateTo)}`);
    } catch {
      // fall through to default below
    }
  }
  if (queryParts.length === 0) {
    queryParts.push(`publication-date >= ${DEFAULT_FROM}`);
  }

  if (languages.length > 0) {
    const langClauses = languages.map((l) => `official-language = ${l.toUpperCase()}`);
    queryParts.push(
      langClauses.length === 1
        ? langClauses[0]
        : `(${langClauses.join(" OR ")})`,
    );
  }

  let builtQuery = queryParts.join(" AND ");

  const fields = [
    "notice-identifier",
    "publication-number",
    "notice-title",
    "description-lot",
    "description-proc",
    "description-part",
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
    limit: Math.min(limit, 250),
    scope: "ALL",
    checkQuerySyntax: false,
    paginationMode: "ITERATION",
    onlyLatestVersions: true,
  };

  if (iterationNextToken) {
    requestBody.iterationNextToken = iterationNextToken;
  }

  console.log("[TED] query=", builtQuery, "| never * | Admin:", isAdmin, "Page:", page);
  console.log("TED API Request Body:", JSON.stringify(requestBody, null, 2));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "TenderMatchingService/1.0",
  };
  const tedApiKey = process.env.TED_API_KEY?.trim();
  if (tedApiKey) {
    headers["Authorization"] = `Bearer ${tedApiKey}`;
    console.log("[TED] TED_API_KEY is set, sending Authorization header");
  } else {
    console.log("[TED] TED_API_KEY not set (Search API allows anonymous; 429 = strict IP rate limit)");
  }

  const maxRetries = 5;
  let response!: Response;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (response.status === 429) {
      await response.text().catch(() => {});
      const retryAfter = response.headers.get("Retry-After");
      const waitSeconds = retryAfter
        ? Math.min(parseInt(retryAfter, 10) || 60, 120)
        : Math.min(Math.pow(2, attempt), 60);
      if (attempt < maxRetries) {
        console.warn(
          `[TED] 429 rate limit (key present: ${!!tedApiKey}). Waiting ${waitSeconds}s before retry ${attempt}/${maxRetries}...`,
        );
        await new Promise((r) => setTimeout(r, waitSeconds * 1000));
        continue;
      }
      console.error("[TED] 429 after all retries. Key present:", !!tedApiKey);
      const error: Error & { status?: number } = new Error(
        tedApiKey
          ? `TED rate limit (429) after ${maxRetries} retries. Search API may apply strict limits; try again later.`
          : `TED rate limit (429). Set TED_API_KEY in .env.local for higher quota.`,
      );
      error.status = 429;
      throw error;
    }

    break;
  }

  if (!response.ok) {
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

  const notices = (data.notices || []) as Array<Record<string, unknown>>;
  const total = data.totalNoticeCount ?? notices.length;
  let nextToken = data.iterationNextToken;
  let hasMore = !!nextToken || notices.length >= limit;

  if (notices.length === 0) {
    nextToken = undefined;
    hasMore = false;
  }

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
      languages,
    } = await request.json();

    // Fetch from TED API
    const { notices, hasMore, nextToken } = await fetchFromTEDAPI(
      dateFrom,
      dateTo,
      page,
      limit,
      iterationNextToken,
      isAdmin,
      Array.isArray(languages) ? languages : TED_DEFAULT_LANGUAGES,
    );

    // If admin is importing, also save to database with duplicate prevention
    if (adminImport && isAdmin && notices.length > 0) {
      const tendersToInsert: TenderInsert[] = notices.map(mapTenderToInsert);

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
        (t) => !existingRefs.has(t.referenceNumber ?? null),
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
              source: "ted_api",
              importedCount: newTenders.length,
              duplicatesSkipped: duplicatesCount,
              totalFetched: notices.length,
            },
          }).catch(() => {});

          // Queue AI processing jobs for new tenders
          if (insertedTenders && insertedTenders.length > 0) {
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

      const actuallyImported = newTenders.length;

      return apiResponse({
        tenders: notices.map(toFeedRecord),
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
      tenders: notices.map(toFeedRecord),
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
          "TED returned no notices. We use scope ALL and a date query; the Search API sometimes returns empty. Try a wider date range, or test the same query in the TED Swagger UI (https://api.ted.europa.eu/swagger-ui/index.html).",
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
