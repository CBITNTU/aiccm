import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { inArray } from "drizzle-orm";
import { getActiveProfile } from "@/lib/deployment";
import { logApiEvent } from "@/lib/services/eventLogger";
import { mapTenderToInsert } from "./mapTenderToInsert";
import type { TenderData, TenderSourceAdapter } from "./types";

export interface IngestedTender {
  id: string;
  referenceNumber: string | null;
  title: string;
  description: string | null;
  buyer: string;
  cpvCodes: string[] | null;
  location: string | null;
}

export interface IngestResult {
  inserted: IngestedTender[];
  newCount: number;
  duplicatesCount: number;
  totalFetched: number;
  embeddedOk: number;
  embedFailed: number;
}

export interface IngestOptions {
  /** Request used for event-log attribution (IP, path). Optional. */
  request?: { headers?: Headers | Record<string, string | string[]>; url?: string; method?: string };
  actorUserId?: string | null;
  actorEmail?: string | null;
}

/**
 * Shared persistence tail for every tender source: dedup on referenceNumber,
 * insert new rows, eagerly embed (when the adapter requests it), queue AI completion
 * jobs, and log the import event. Region/source/currency are stamped from the active
 * deployment profile + adapter.
 */
export async function ingestTenders(
  tendersData: TenderData[],
  adapter: TenderSourceAdapter,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const region = getActiveProfile().id;
  const totalFetched = tendersData.length;

  const tendersToInsert = tendersData.map((t) =>
    mapTenderToInsert(t, {
      region,
      defaultCurrency: adapter.defaultCurrency,
      source: adapter.id,
    }),
  );

  const refNumbers = tendersToInsert
    .map((t) => t.referenceNumber)
    .filter(Boolean) as string[];

  let existingRefs = new Set<string | null>();
  if (refNumbers.length > 0) {
    const existing = await db
      .select({ referenceNumber: tenders.referenceNumber })
      .from(tenders)
      .where(inArray(tenders.referenceNumber, refNumbers));
    existingRefs = new Set(existing.map((t) => t.referenceNumber));
  }

  const newTenders = tendersToInsert.filter(
    (t) => !existingRefs.has(t.referenceNumber ?? null),
  );
  const duplicatesCount = tendersToInsert.length - newTenders.length;

  const result: IngestResult = {
    inserted: [],
    newCount: 0,
    duplicatesCount,
    totalFetched,
    embeddedOk: 0,
    embedFailed: 0,
  };

  if (newTenders.length === 0) {
    return result;
  }

  let insertedTenders: IngestedTender[] = [];
  try {
    insertedTenders = await db
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
  } catch (insertError) {
    console.error(`[ingest:${adapter.id}] Error importing tenders:`, insertError);
    return result;
  }

  result.inserted = insertedTenders;
  result.newCount = newTenders.length;

  console.log(
    `[ingest:${adapter.id}] Imported ${newTenders.length} new tenders (${duplicatesCount} duplicates skipped)`,
  );

  // Eager embed (best-effort) when the adapter requests it. Per-tender failures are
  // tolerated; each tender also gets a tender_ai_complete job below which re-embeds.
  if (adapter.eagerEmbed && insertedTenders.length > 0) {
    try {
      const { embedTender } = await import("@/lib/services/embeddingService");
      const CONCURRENCY = 4;
      const queue = [...insertedTenders];
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (queue.length > 0) {
            const t = queue.shift();
            if (!t) break;
            try {
              await embedTender(t.id);
              result.embeddedOk++;
            } catch (e) {
              result.embedFailed++;
              console.error(`Embedding tender ${t.id} failed (non-fatal):`, e);
            }
          }
        }),
      );
    } catch (embedError) {
      console.error("Bulk tender embedding failed (non-fatal):", embedError);
    }
  }

  // Log the import event (best-effort).
  if (options.request) {
    await logApiEvent(options.request, {
      actionType: "admin_tender_imported",
      userId: options.actorUserId ?? null,
      userEmail: options.actorEmail ?? undefined,
      details: {
        source: adapter.id,
        region,
        importedCount: result.newCount,
        duplicatesSkipped: duplicatesCount,
        totalFetched,
        embeddedOk: result.embeddedOk,
        embedFailed: result.embedFailed,
      },
    }).catch(() => {});
  }

  // Queue AI processing jobs for the new tenders.
  if (insertedTenders.length > 0) {
    try {
      const { enqueueBatch } = await import("@/lib/services/queueService");
      const jobs = insertedTenders.map((t) => ({
        jobType: "tender_ai_complete" as const,
        entityType: "tender" as const,
        entityId: t.id,
        priority: 5,
      }));
      await enqueueBatch(
        jobs,
        "tender_ai_regeneration",
        options.actorUserId ?? undefined,
      );
      console.log(
        `[ingest:${adapter.id}] Queued ${jobs.length} AI processing jobs`,
      );
    } catch (queueError) {
      console.error("Failed to queue AI processing jobs:", queueError);
    }
  }

  return result;
}
