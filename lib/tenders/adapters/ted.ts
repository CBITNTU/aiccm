import type {
  TenderData,
  TenderFetchParams,
  TenderFetchResult,
  TenderSourceAdapter,
} from "../types";

const TED_API_BASE = "https://api.ted.europa.eu/v3";

/** ISO 639-3 language codes accepted by TED `official-language` field. */
const TED_DEFAULT_LANGUAGES = ["ENG"];

// TED API may return fields as arrays or strings; normalize safely.
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

function toFirst(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  return String(value);
}

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

function extractLocalised(
  obj: unknown,
  preferredLangs: string[] = ["eng", "en", "ENG"],
): string {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object" || Array.isArray(obj)) return toStringOrJoin(obj, " ");
  const map = obj as Record<string, unknown>;
  for (const lang of preferredLangs) {
    if (map[lang] != null) {
      const val = map[lang];
      if (Array.isArray(val)) return val.map(String).join(" ");
      return String(val);
    }
  }
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

  const locationCodes = [
    ...new Set([
      ...toArray(notice["place-of-performance-country-lot"]),
      ...toArray(notice["buyer-country"]),
    ]),
  ];
  const location = locationCodes.length > 0 ? locationCodes.join(", ") : "EU";

  const cpvCodes: string[] = [
    ...new Set([
      ...toArray(notice["main-classification-lot"]),
      ...toArray(notice["additional-classification-lot"]),
    ]),
  ];

  const estimatedValue = notice["estimated-value-lot"] as number[] | undefined;
  const budgetMin = estimatedValue?.[0] ? Math.floor(estimatedValue[0] * 100) : null;
  const budgetMax = estimatedValue?.[1] ? Math.floor(estimatedValue[1] * 100) : null;

  const publicationDate =
    parseTEDDate(notice["publication-date"]) || new Date().toISOString();
  const deadlineDate = parseTEDDate(notice["deadline-date-lot"]) || undefined;

  const status = "open";

  const buyerEmail = toStringOrJoin(notice["buyer-email"], ", ") || undefined;
  const buyerContact =
    toStringOrJoin(notice["buyer-contact-point"], ", ") || undefined;

  const contactInfo = {
    email: buyerEmail,
    phone: undefined,
    organization: buyer,
    contactPoint: buyerContact,
  };

  const noticeUrl = portalNoticeId
    ? `https://ted.europa.eu/en/notice/-/detail/${portalNoticeId}`
    : "https://ted.europa.eu";

  return {
    reference_number: portalNoticeId,
    title: title || "Untitled Tender",
    buyer,
    cpv_codes: cpvCodes.length > 0 ? cpvCodes : [],
    description: description || "",
    budget_min: budgetMin,
    budget_max: budgetMax,
    location,
    deadline: deadlineDate || null,
    status,
    publication_date: publicationDate,
    contact_info: contactInfo,
    requirements: {
      sectors: cpvCodes,
      location,
      deadline: deadlineDate,
    },
    documents: {
      specification_url: noticeUrl,
      application_url: noticeUrl,
    },
    source: "ted",
    currency: "EUR",
    external_id: noticeIdentifier || portalNoticeId,
  };
}

async function fetchFromTEDAPI(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  limit: number,
  iterationNextToken: string | undefined,
  isAdmin: boolean,
  languages: string[],
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
      langClauses.length === 1 ? langClauses[0] : `(${langClauses.join(" OR ")})`,
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

  console.log("[TED] query=", builtQuery, "| never * | Admin:", isAdmin);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "TenderMatchingService/1.0",
  };
  const tedApiKey = process.env.TED_API_KEY?.trim();
  if (tedApiKey) {
    headers["Authorization"] = `Bearer ${tedApiKey}`;
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

  return {
    notices: notices.map((notice) => transformTEDToTender(notice)),
    total,
    hasMore,
    nextToken,
  };
}

export const tedAdapter: TenderSourceAdapter = {
  id: "ted",
  label: "TED (EU)",
  defaultCurrency: "EUR",
  eagerEmbed: false,
  // TED rate-limits at ~10 req/burst even with a key; pace pages 3s apart.
  syncDelayMs: 3000,
  async fetch(params: TenderFetchParams): Promise<TenderFetchResult> {
    const {
      isAdmin = false,
      limit = 100,
      iterationNextToken,
      page = 1,
      filters,
      languages,
    } = params;
    const { notices, total, hasMore, nextToken } = await fetchFromTEDAPI(
      filters?.dateFrom as string | undefined,
      filters?.dateTo as string | undefined,
      limit,
      iterationNextToken,
      isAdmin,
      Array.isArray(languages) ? languages : TED_DEFAULT_LANGUAGES,
    );

    return {
      tenders: notices,
      total,
      hasMore: hasMore && isAdmin,
      nextToken: hasMore && isAdmin ? (nextToken ?? null) : null,
      nextPage: hasMore && isAdmin ? page + 1 : null,
    };
  },
};
