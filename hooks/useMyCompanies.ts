"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

async function fetchMyCompanies(): Promise<Company[]> {
  const data = await api.getMyCompanies();
  return (data.companies as unknown as Company[]) || [];
}

export function useMyCompanies(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.myCompanies(userId!),
    queryFn: fetchMyCompanies,
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // 2 min
    gcTime: 10 * 60 * 1000, // 10 min
  });
}
