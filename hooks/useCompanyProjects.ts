"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export interface PastProject {
  name: string;
  description?: string;
  client?: string;
  value?: string;
  year?: string;
  sector?: string;
  isLegacy?: boolean;
}

export interface VOProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  tenderTitle: string | null;
  tenderBuyer: string | null;
  tenderLocation: string | null;
  createdAt: string;
}

export function useCompanyProjects(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.companyProjects(companyId!),
    queryFn: () => api.getCompanyProjects(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}
