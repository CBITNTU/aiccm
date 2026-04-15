type DocumentsPayload = {
  application_url?: unknown;
  specification_url?: unknown;
};

export type ExternalTenderSource =
  | "find-a-tender"
  | "ted"
  | "contracts-finder"
  | "unknown";

export interface ExternalNoticeLink {
  url: string | null;
  source: ExternalTenderSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getPortalHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function inferSourceFromUrl(url: string): ExternalTenderSource {
  const hostname = getPortalHostname(url);
  if (!hostname) {
    return "unknown";
  }

  if (hostname.includes("ted.europa.eu")) {
    return "ted";
  }

  if (hostname.includes("find-tender.service.gov.uk")) {
    return "find-a-tender";
  }

  if (hostname.includes("contracts-finder.service.gov.uk")) {
    return "contracts-finder";
  }

  return "unknown";
}

function getDocumentUrl(documents: unknown): string | null {
  if (!isRecord(documents)) {
    return null;
  }

  const typedDocuments = documents as DocumentsPayload;
  return (
    getStringValue(typedDocuments.application_url) ||
    getStringValue(typedDocuments.specification_url)
  );
}

function getFindATenderFallback(referenceNumber: string | null | undefined): string | null {
  const reference = getStringValue(referenceNumber);
  if (!reference) {
    return null;
  }

  return `https://www.find-tender.service.gov.uk/Notice/${reference}?origin=SearchResults`;
}

export function resolveExternalNoticeLink(params: {
  documents: unknown;
  referenceNumber: string | null | undefined;
}): ExternalNoticeLink {
  const documentUrl = getDocumentUrl(params.documents);
  if (documentUrl) {
    return {
      url: documentUrl,
      source: inferSourceFromUrl(documentUrl),
    };
  }

  const fallbackUrl = getFindATenderFallback(params.referenceNumber);
  return {
    url: fallbackUrl,
    source: fallbackUrl ? "find-a-tender" : "unknown",
  };
}
