import { getActiveProfile } from "@/lib/deployment";
import type { TaxonomyProvider } from "./types";
import { cpvEicProvider } from "./providers/cpvEic";
import { stubTaxonomyProvider } from "./providers/stub";

export type { TaxonomyProvider } from "./types";

const REGISTRY: Record<string, TaxonomyProvider> = {
  [cpvEicProvider.id]: cpvEicProvider,
  [stubTaxonomyProvider.id]: stubTaxonomyProvider,
};

/** The taxonomy provider for the active deployment profile. */
export function getTaxonomyProvider(): TaxonomyProvider {
  const profile = getActiveProfile();
  return REGISTRY[profile.taxonomy] ?? stubTaxonomyProvider;
}
