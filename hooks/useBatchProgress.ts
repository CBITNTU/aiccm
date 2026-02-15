"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface BatchStatus {
  id: string;
  batchType: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: "processing" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

async function fetchBatchStatus(batchId: string): Promise<BatchStatus> {
  const response = await fetch(`/api/queue/job-status?batchId=${batchId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch batch status");
  }
  const data = await response.json();
  if (!data.success || !data.batch) {
    throw new Error(data.error || "Failed to fetch batch status");
  }
  return data.batch;
}

export function useBatchProgress(batchId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.batchProgress(batchId!),
    queryFn: () => fetchBatchStatus(batchId!),
    enabled: !!batchId && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "completed" || data?.status === "failed")
        return false;
      return 2500;
    },
  });

  const batch = query.data ?? null;
  const progress = batch
    ? Math.round((batch.completedJobs / batch.totalJobs) * 100)
    : 0;

  return {
    batch,
    progress,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
