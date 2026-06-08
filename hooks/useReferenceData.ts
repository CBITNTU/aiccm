"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

// Reference taxonomies (capabilities, markets) are large, global, and rarely
// change. Cache them aggressively so the full list is fetched at most once per
// session and shared across every consumer (tree selectors, diff views, etc.).
const REFERENCE_QUERY_OPTIONS = {
  staleTime: 30 * 60 * 1000, // 30 minutes
  gcTime: 60 * 60 * 1000, // 1 hour
} as const;

export function useReferenceCapabilities(enabled = true) {
  return useQuery({
    queryKey: queryKeys.referenceCapabilities(),
    queryFn: async () => (await api.getCapabilities()).capabilities,
    enabled,
    ...REFERENCE_QUERY_OPTIONS,
  });
}

export function useReferenceMarkets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.referenceMarkets(),
    queryFn: async () => (await api.getMarkets()).markets,
    enabled,
    ...REFERENCE_QUERY_OPTIONS,
  });
}
