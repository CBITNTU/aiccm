"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export interface Taxonomy {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  description: string | null;
}

export function useTaxonomies(enabled = true) {
  const {
    data: taxonomies = [],
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.taxonomies(),
    enabled,
    queryFn: async () => {
      const data = await api.getTaxonomies();
      const items = data.taxonomies as Taxonomy[];
      const l1 = items.filter((t) => t.level === 1).length;
      const l2 = items.filter((t) => t.level === 2).length;
      const l3 = items.filter((t) => t.level === 3).length;
      console.debug(
        `[useTaxonomies] Fetched ${items.length} taxonomies (L1: ${l1}, L2: ${l2}, L3: ${l3})`,
      );
      if (items.length === 0) {
        console.warn(
          "[useTaxonomies] No taxonomies found — the taxonomies table may be empty. Run the EIC seed migration.",
        );
      }
      return items;
    },
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 60 * 60 * 1000, // 60 min
  });

  const getLevel1 = () => taxonomies.filter((t) => t.level === 1);

  const getLevel2 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 2 && t.parentId === parentId);

  const getLevel3 = (parentId: string | null) =>
    taxonomies.filter((t) => t.level === 3 && t.parentId === parentId);

  const getTaxonomyById = (id: string | null) =>
    taxonomies.find((t) => t.id === id);

  return {
    taxonomies,
    loading,
    getLevel1,
    getLevel2,
    getLevel3,
    getTaxonomyById,
    refetch,
  };
}
