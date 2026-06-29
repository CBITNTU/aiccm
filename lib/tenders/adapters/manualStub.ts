import type { TenderFetchResult, TenderSourceAdapter } from "../types";

/**
 * Placeholder source for regions without an automated tender feed yet (China,
 * Thailand). It never fetches anything — tenders for these deployments are entered
 * via the admin import UI. Registered so the sync/registry treatment is uniform.
 */
function makeManualStub(id: string, label: string): TenderSourceAdapter {
  return {
    id,
    label,
    defaultCurrency: null,
    eagerEmbed: false,
    async fetch(): Promise<TenderFetchResult> {
      console.log(`[${id}] manual source — no automated fetch; skipping.`);
      return { tenders: [], hasMore: false };
    },
  };
}

export const cnManualAdapter = makeManualStub("cn_manual", "China (manual)");
export const thManualAdapter = makeManualStub("th_manual", "Thailand (manual)");
