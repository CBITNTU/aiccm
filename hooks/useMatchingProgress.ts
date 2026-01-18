import { useState, useEffect } from "react";

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

export function useMatchingProgress(companyId: string | null, enabled = true) {
  const [status, setStatus] = useState<MatchingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !enabled) {
      setStatus(null);
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/match-tenders/status`);
        if (!response.ok) {
          throw new Error("Failed to fetch matching status");
        }

        const data = await response.json();
        if (data.success) {
          setStatus(data);
          setError(null);

          // Stop polling if all jobs are complete or failed
          if (data.pending === 0 && data.processing === 0) {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        } else {
          throw new Error(data.error || "Failed to fetch status");
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
  }, [companyId, enabled]);

  return { status, isLoading, error };
}
