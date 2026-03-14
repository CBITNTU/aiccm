"use client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { normalizeCompanyRecord } from "@/lib/api/types";

async function fetchPublicCompany(companyId: string) {
  const res = await fetch(`/api/public/companies/${companyId}`);
  if (!res.ok) throw new Error("Company not found");
  const data = (await res.json()) as {
    company: Record<string, unknown>;
    taxonomies: { id: string; name: string }[];
  };
  return {
    ...data,
    company: normalizeCompanyRecord(data.company),
  };
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
