"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useVerificationStatus(companyId: string | null) {
  return useQuery({
    queryKey: queryKeys.verificationStatus(companyId!),
    queryFn: () => api.getVerificationStatus(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}
