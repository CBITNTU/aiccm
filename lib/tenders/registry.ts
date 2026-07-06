import { getActiveProfile } from "@/lib/deployment";
import type { TenderSourceAdapter } from "./types";
import { findTenderAdapter } from "./adapters/findTender";
import { tedAdapter } from "./adapters/ted";
import { shanghaiZbycgAdapter } from "./adapters/shanghai";
import { cnManualAdapter, thManualAdapter } from "./adapters/manualStub";

const REGISTRY: Record<string, TenderSourceAdapter> = {
  [findTenderAdapter.id]: findTenderAdapter,
  [tedAdapter.id]: tedAdapter,
  [shanghaiZbycgAdapter.id]: shanghaiZbycgAdapter,
  [cnManualAdapter.id]: cnManualAdapter,
  [thManualAdapter.id]: thManualAdapter,
};

/** Look up a single adapter by id, or undefined if unknown. */
export function getTenderAdapter(id: string): TenderSourceAdapter | undefined {
  return REGISTRY[id];
}

/** The tender source adapters enabled for the active deployment profile. */
export function getAdaptersForProfile(): TenderSourceAdapter[] {
  const profile = getActiveProfile();
  return profile.tenderSources
    .map((id) => REGISTRY[id])
    .filter((a): a is TenderSourceAdapter => {
      if (!a) {
        console.warn(`[tenders] Unknown tender source id in profile: skipping.`);
        return false;
      }
      return true;
    });
}
