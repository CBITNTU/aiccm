/**
 * Shared internal representation of a tender, produced by every source adapter and
 * consumed by the shared ingest pipeline. Previously duplicated in each fetch route.
 */
export interface TenderData {
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
  /** Per-notice ISO 4217 currency, when the source provides it. */
  currency?: string | null;
}

/** Parameters passed to a source adapter's fetch(). Sources use the subset they support. */
export interface TenderFetchParams {
  isAdmin?: boolean;
  limit?: number;
  searchTerm?: string;
  filters?: Record<string, unknown>;
  /** Find-a-Tender style cursor pagination. */
  cursor?: string;
  /** TED style token/page pagination. */
  iterationNextToken?: string;
  page?: number;
  /** TED language filter (ISO 639-3, e.g. ["ENG"]). */
  languages?: string[];
}

/** Result of a single page fetch from a source adapter. */
export interface TenderFetchResult {
  tenders: TenderData[];
  total?: number;
  hasMore: boolean;
  /** Find-a-Tender style next cursor. */
  nextCursor?: string | null;
  /** TED style next token. */
  nextToken?: string | null;
  /** TED style next page number. */
  nextPage?: number | null;
}

/**
 * A pluggable tender data source. UK Find-a-Tender and EU TED are the reference
 * implementations; manual stubs (CN/TH) return no data until a concrete source exists.
 */
export interface TenderSourceAdapter {
  /** Stable id stored on `tenders.source` and referenced from deployment profiles. */
  id: string;
  /** Human label for logs/UI. */
  label: string;
  /** Default ISO 4217 currency for notices from this source. */
  defaultCurrency: string | null;
  /** Whether newly imported tenders should be embedded eagerly at import time. */
  eagerEmbed?: boolean;
  /** Delay between paginated pages during full sync, to respect upstream rate limits. */
  syncDelayMs?: number;
  fetch(params: TenderFetchParams): Promise<TenderFetchResult>;
}
