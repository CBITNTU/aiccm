"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

interface DirectoryParams {
  search?: string;
  taxonomyIds?: string[];
  page?: number;
  limit?: number;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  approvedOnly?: boolean;
}

export function useDirectory(params: DirectoryParams) {
  const filterKey = {
    search: params.search,
    taxonomyIds: params.taxonomyIds,
    page: params.page,
    limit: params.limit,
    lat: params.lat,
    lng: params.lng,
    radiusMiles: params.radiusMiles,
    approvedOnly: params.approvedOnly,
  };

  return useQuery({
    queryKey: queryKeys.directory(filterKey),
    queryFn: () => api.getDirectory(params),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
