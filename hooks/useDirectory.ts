"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

interface DirectoryParams {
  search?: string;
  location?: string;
  capability?: string;
  taxonomyIds?: string[];
  page?: number;
  limit?: number;
}

export function useDirectory(params: DirectoryParams) {
  const filterKey = {
    search: params.search,
    location: params.location,
    capability: params.capability,
    taxonomyIds: params.taxonomyIds,
    page: params.page,
    limit: params.limit,
  };

  return useQuery({
    queryKey: queryKeys.directory(filterKey),
    queryFn: () => api.getDirectory(params),
    staleTime: 2 * 60 * 1000, // 2 min
    gcTime: 5 * 60 * 1000, // 5 min
    placeholderData: keepPreviousData,
  });
}
