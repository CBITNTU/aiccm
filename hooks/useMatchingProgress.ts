"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface MatchingStatus {
  total: number;
  completed: number;
  processing: number;
  pending: number;
  failed: number;
  estimatedSeconds: number;
  results: Array<{
    tenderId: string;
    score: { overallScore?: number };
    completedAt: string | null;
  }>;
}

async function fetchMatchingStatus(): Promise<MatchingStatus> {
  const response = await fetch(`/api/match-tenders/status`);
  if (!response.ok) {
    throw new Error("Failed to fetch matching status");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch status");
  }
  return data;
}

export function useMatchingProgress(companyId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.matchingProgress(companyId!),
    queryFn: fetchMatchingStatus,
    enabled: !!companyId && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.pending === 0 && data.processing === 0) return false;
      return 2500;
    },
  });

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
