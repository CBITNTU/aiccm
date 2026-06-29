import { tenders } from "@/lib/db/schema/app";
import type { TenderData } from "./types";

type TenderInsert = typeof tenders.$inferInsert;

/** Shape returned to API clients (camelCased feed record). */
export function toFeedRecord(t: TenderData) {
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
    currency: t.currency ?? null,
  };
}

/**
 * Mechanical mapping of a `TenderData` to a DB insert row. Stamps the deployment
 * `region`, the adapter `source`, and the captured `currency`. Adapters are expected
 * to fully populate `requirements`/`documents` (no source-specific fallbacks here).
 */
export function mapTenderToInsert(
  tender: TenderData,
  ctx: { region: string; defaultCurrency: string | null; source: string },
): TenderInsert {
  return {
    referenceNumber: tender.reference_number,
    title: tender.title,
    buyer: tender.buyer,
    cpvCodes: tender.cpv_codes,
    description: tender.description,
    budgetMin: tender.budget_min,
    budgetMax: tender.budget_max,
    currency: tender.currency ?? ctx.defaultCurrency,
    region: ctx.region,
    source: tender.source ?? ctx.source,
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
