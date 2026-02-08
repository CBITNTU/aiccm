import { useState, useEffect } from "react";

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

export function useBatchProgress(batchId: string | null, enabled = true) {
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId || !enabled) {
      setBatch(null);
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/queue/job-status?batchId=${batchId}`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch batch status");
        }

        const data = await response.json();
        if (data.success && data.batch) {
          setBatch(data.batch);
          setError(null);

          // Stop polling if batch is complete or failed
          if (
            data.batch.status === "completed" ||
            data.batch.status === "failed"
          ) {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        } else {
          throw new Error(data.error || "Failed to fetch batch status");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 2-3 seconds while processing
    if (enabled) {
      intervalId = setInterval(fetchStatus, 2500);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [batchId, enabled]);

  const progress = batch
    ? Math.round((batch.completedJobs / batch.totalJobs) * 100)
    : 0;

  return { batch, progress, isLoading, error };
}
