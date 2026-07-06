import { getActiveProfile } from "@/lib/deployment";
import type { CompanyRegistryAdapter } from "./types";
import { ukCompaniesHouseAdapter } from "./adapters/ukCompaniesHouse";
import { cnManualRegistry, thManualRegistry } from "./adapters/manual";

export type {
  CompanyRegistryAdapter,
  CompanyLookupData,
  CompanyLookupResult,
} from "./types";

const REGISTRY: Record<string, CompanyRegistryAdapter> = {
  [ukCompaniesHouseAdapter.id]: ukCompaniesHouseAdapter,
  [cnManualRegistry.id]: cnManualRegistry,
  [thManualRegistry.id]: thManualRegistry,
};

/** The company registry adapter for the active deployment profile. */
export function getRegistryAdapter(): CompanyRegistryAdapter {
  const profile = getActiveProfile();
  const adapter = REGISTRY[profile.verificationProvider];
  if (!adapter) {
    throw new Error(
      `Unknown verificationProvider "${profile.verificationProvider}" in deployment profile "${profile.id}".`,
    );
  }
  return adapter;
}
