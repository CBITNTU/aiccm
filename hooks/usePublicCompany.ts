"use client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

async function fetchPublicCompany(companyId: string) {
  const res = await fetch(`/api/public/companies/${companyId}`);
  if (!res.ok) throw new Error("Company not found");
  return res.json() as Promise<{
    company: Record<string, unknown>;
    taxonomies: { id: string; name: string }[];
  }>;
}

export function usePublicCompany(companyId: string) {
  return useQuery({
    queryKey: queryKeys.publicCompany(companyId),
    queryFn: () => fetchPublicCompany(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
