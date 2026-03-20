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

export function useTaxonomies() {
  const {
    data: taxonomies = [],
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.taxonomies(),
    queryFn: async () => {
      const data = await api.getTaxonomies();
      return data.taxonomies as Taxonomy[];
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
