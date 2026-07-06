import { getTableColumns } from "drizzle-orm";
import { companies, tenders } from "@/lib/db/schema/app";

// The 1536-dim embedding vector (~6KB/company, ~12KB/tender) plus its bookkeeping.
// Nothing client-side reads these, and similarity search runs in-DB (see
// lib/services/basicMatchingService.ts), so they should never be SELECTed out
// of Postgres on read paths.
const EMBEDDING_KEYS = ["embedding", "embeddingGeneratedAt", "embeddingSourceHash"] as const;

// Large company JSONB blobs only read on detail/edit/analysis screens — never on
// list views. Dropping these (plus the embedding) is the bulk of the egress win
// while keeping every scalar/text column intact for unknown list consumers.
const COMPANY_HEAVY_JSON_KEYS = [
  "aiCompetencies",
  "aiCapabilities",
  "aiStrengths",
  "aiCertifications",
  "aiRecommendations",
  "aiAnalysis",
  "aiCapabilityTaxonomy",
  "systemExtracted",
  "humanVerified",
  "financialData",
  "complianceData",
  "operationLocations",
  "pendingChanges",
] as const;

function omit<T extends Record<string, unknown>>(cols: T, keys: readonly string[]): T {
  const out = { ...cols };
  for (const key of keys) {
    delete out[key as keyof T];
  }
  return out;
}

// Full record minus the embedding vector — safe default whenever a caller
// genuinely needs the rest of the row (detail/edit/admin views).
export const tenderColumnsNoEmbedding = omit(getTableColumns(tenders), EMBEDDING_KEYS);
export const companyColumnsNoEmbedding = omit(getTableColumns(companies), EMBEDDING_KEYS);

// Lean projections for high-traffic list endpoints — only the fields the UI
// actually reads. Keeps responses small on the hottest paths.
export const tenderListColumns = {
  id: tenders.id,
  title: tenders.title,
  buyer: tenders.buyer,
  referenceNumber: tenders.referenceNumber,
  description: tenders.description,
  cpvCodes: tenders.cpvCodes,
  location: tenders.location,
  status: tenders.status,
  deadline: tenders.deadline,
  publicationDate: tenders.publicationDate,
  budgetMin: tenders.budgetMin,
  budgetMax: tenders.budgetMax,
  currency: tenders.currency,
  aiSummary: tenders.aiSummary,
  documents: tenders.documents,
};

// Every company column except the embedding vector and the heavy AI JSONB blobs.
// Keeps all scalar/text fields (name, description, capabilities, contact, address…)
// that list-view consumers read, while shedding the multi-KB payload.
export const companyListColumns = omit(getTableColumns(companies), [
  ...EMBEDDING_KEYS,
  ...COMPANY_HEAVY_JSON_KEYS,
]);
