import type {
  TenderData,
  TenderFetchParams,
  TenderFetchResult,
  TenderSourceAdapter,
} from "../types";

const FIND_TENDER_API_BASE = "https://www.find-tender.service.gov.uk/api/1.0";

// Transform OCDS release data to our internal tender format.
function transformOCDSToTender(
  release: Record<string, unknown>,
  ocid: string,
): TenderData {
  const tender = (release.tender || {}) as Record<string, unknown>;
  const parties = (release.parties || []) as Array<Record<string, unknown>>;
  const buyer = parties.find((p) =>
    (p.roles as string[] | undefined)?.includes("buyer"),
  );

  const noticeId =
    (release.id as string) ||
    ocid.replace("ocds-h6vhtk-", "").replace("-integration", "");

  const convertBudget = (value: unknown): number | null => {
    if (!value || value === 0) return null;
    const numValue = Number(value);
    if (isNaN(numValue)) return null;
    return Math.floor(numValue);
  };

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
      if (additionalClassifications && Array.isArray(additionalClassifications)) {
        additionalClassifications.forEach((ac) => {
          if (ac.id && (ac.scheme === "CPV" || !ac.scheme)) {
            cpvSet.add(ac.id as string);
          }
        });
      }
    });
  }

  const tenderClassification = tender.classification as
    | Record<string, unknown>
    | undefined;
  if (cpvSet.size === 0 && tenderClassification?.id) {
    cpvSet.add(tenderClassification.id as string);
  }

  const cpvCodes = Array.from(cpvSet);

  const tenderPeriod = tender.tenderPeriod as Record<string, unknown> | undefined;
  const enquiryPeriod = tender.enquiryPeriod as Record<string, unknown> | undefined;
  const tenderValue = tender.value as Record<string, unknown> | undefined;
  const minValue = tender.minValue as Record<string, unknown> | undefined;
  const maxValue = tender.maxValue as Record<string, unknown> | undefined;
  const deliveryLocation = tender.deliveryLocation as
    | Record<string, unknown>
    | undefined;
  const buyerContactPoint = buyer?.contactPoint as
    | Record<string, unknown>
    | undefined;

  const location = (deliveryLocation?.description as string) || "United Kingdom";
  const deadline =
    (tenderPeriod?.endDate as string) ||
    (enquiryPeriod?.endDate as string) ||
    null;
  const noticeUrl = `${FIND_TENDER_API_BASE.replace("/api/1.0", "")}/Notice/${noticeId}?origin=SearchResults&p=1`;

  return {
    id: (release.id as string) || ocid,
    reference_number: (release.id as string) || ocid,
    title: (tender.title as string) || "Untitled Tender",
    description:
      (tender.description as string) || (release.description as string) || "",
    buyer: (buyer?.name as string) || "Unknown Buyer",
    location,
    status:
      tender.status === "active" ? "open" : (tender.status as string) || "open",
    publication_date: (release.date as string) || new Date().toISOString(),
    deadline,
    budget_min: convertBudget(tenderValue?.amount || minValue?.amount),
    budget_max: convertBudget(tenderValue?.amount || maxValue?.amount),
    cpv_codes: cpvCodes,
    contact_info: {
      email: buyerContactPoint?.email || null,
      phone: buyerContactPoint?.telephone || null,
      organization: (buyer?.name as string) || "Unknown Buyer",
    },
    // Populate requirements/documents here so the shared mapper stays mechanical.
    requirements: {
      sectors: cpvCodes,
      location: location.split(",")[1]?.trim() || "UK",
      deadline,
    },
    documents: {
      specification_url: noticeUrl,
      application_url: noticeUrl,
    },
    source: "find_tender",
    currency: "GBP",
    external_id: noticeId,
    ocid,
  };
}

async function fetchFromFindTenderAPI(
  limit: number,
  cursor: string | undefined,
  isAdmin: boolean,
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
    // Find-a-Tender's pagination requires the EXACT same `updatedFrom`/`updatedTo`
    // used for the cursor's original page. The cursor is base64 of
    // `updatedFrom=...|updatedTo=...|nextCursor=N`, so decode and forward all three.
    params.append("cursor", cursor);
    try {
      const decoded = Buffer.from(cursor, "base64").toString("utf8");
      const parts = Object.fromEntries(
        decoded.split("|").map((p) => {
          const eq = p.indexOf("=");
          return eq === -1 ? [p, ""] : [p.slice(0, eq), p.slice(eq + 1)];
        }),
      );
      if (parts.updatedFrom) params.append("updatedFrom", parts.updatedFrom);
      if (parts.updatedTo) params.append("updatedTo", parts.updatedTo);
    } catch (e) {
      console.error("Failed to decode upstream cursor:", e);
    }
  } else {
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
  }

  const url = `${FIND_TENDER_API_BASE}/ocdsReleasePackages?${params.toString()}`;
  console.log("Fetching from Find a Tender API:", url, `(Admin: ${isAdmin})`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TenderMatchingService/1.0",
    },
    // Bound the request so a hanging upstream can't stall the sync.
    signal: AbortSignal.timeout(30000),
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

  return response.json();
}

function extractNextCursor(
  links: Record<string, string | { href?: string }> | undefined,
): string | null {
  const nextUrlString =
    typeof links?.next === "string"
      ? links.next
      : (links?.next as { href?: string } | undefined)?.href;
  if (!nextUrlString) return null;
  try {
    const nextUrl = new URL(nextUrlString);
    return nextUrl.searchParams.get("cursor");
  } catch (e) {
    console.error("Error parsing next URL:", e, nextUrlString);
    return null;
  }
}

export const findTenderAdapter: TenderSourceAdapter = {
  id: "find_tender",
  label: "Find a Tender (UK)",
  defaultCurrency: "GBP",
  eagerEmbed: true,
  syncDelayMs: 1000,
  async fetch(params: TenderFetchParams): Promise<TenderFetchResult> {
    const { isAdmin = false, limit = 100, cursor, filters, searchTerm } = params;
    const ocdsData = await fetchFromFindTenderAPI(limit, cursor, isAdmin, filters);

    const releases = ocdsData.releases as
      | Array<Record<string, unknown>>
      | undefined;
    let tendersData: TenderData[] = releases?.length
      ? releases.map((release) =>
          transformOCDSToTender(release, release.ocid as string),
        )
      : [];

    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      tendersData = tendersData.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.buyer.toLowerCase().includes(q) ||
          t.location.toLowerCase().includes(q),
      );
    }

    // Budget filter
    if (filters?.budgetMin || filters?.budgetMax) {
      tendersData = tendersData.filter((t) => {
        const budget = t.budget_max || t.budget_min || 0;
        if (filters.budgetMin && budget < (filters.budgetMin as number)) return false;
        if (filters.budgetMax && budget > (filters.budgetMax as number)) return false;
        return true;
      });
    }

    const links = ocdsData.links as
      | Record<string, string | { href?: string }>
      | undefined;
    const nextCursor = extractNextCursor(links);
    // Preserve the original heuristic: a full page (>=100) implies more for admins.
    const gotMaxResults = (releases?.length ?? 0) >= 100;
    const hasMore = (!!nextCursor || gotMaxResults) && isAdmin;

    return { tenders: tendersData, hasMore, nextCursor: isAdmin ? nextCursor : null };
  },
};
