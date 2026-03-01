"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useDirectoryCompany(companyId: string) {
  return useQuery({
    queryKey: queryKeys.directoryCompany(companyId),
    queryFn: () => api.getDirectoryCompany(companyId),
    staleTime: 2 * 60 * 1000,
    enabled: !!companyId,
  });
}
