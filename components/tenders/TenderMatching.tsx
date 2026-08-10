"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenderMatches } from "@/hooks/useTenderMatches";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  Target,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { TenderMatchCard } from "./TenderMatchCard";
import { ResultsHeader } from "./ResultsHeader";
import { MatchingReadinessDialog } from "./MatchingReadinessDialog";
import { checkMatchingReadiness, type ReadinessResult } from "@/lib/matchingReadiness";
import { queryKeys } from "@/lib/queryKeys";
import type { CompanyRecord } from "@/lib/api/types";

export interface MatchingFiltersState {
  keyword?: string;
  sortBy: string;
  sortDirection: string;
  minScore: number;
  maxScore: number;
  showApplied: string;
  quickFilter?: string | null;
  tenderStatus?: string;
}

const DEFAULT_FILTERS: MatchingFiltersState = {
  sortBy: "overall_score",
  sortDirection: "desc",
  minScore: 0,
  maxScore: 100,
  showApplied: "all",
  tenderStatus: "active",
};

/** Which slice of this company's matching results is on screen. */
export type MatchesView = "matched" | "ruledOut";

interface TenderMatchingProps {
  companyId?: string;
  companyData?: CompanyRecord;
  filters?: MatchingFiltersState;
  onCreateProject?: (tenderId: string) => void;
  readOnly?: boolean;
  /** Defaults to the scored matches; "ruledOut" shows the 0% deep analyses. */
  view?: MatchesView;
  onViewChange?: (view: MatchesView) => void;
  /**
   * Reports the ruled-out total upward so the view switch — which renders above
   * the search bar, outside this component — can badge it. Must be stable
   * (useCallback) at the call site.
   */
  onRuledOutCountChange?: (count: number) => void;
}

export function TenderMatching({
  companyId,
  companyData,
  filters: filtersProp,
  onCreateProject: _onCreateProject,
  readOnly = false,
  view = "matched",
  onViewChange,
  onRuledOutCountChange,
}: TenderMatchingProps) {
  const t = useTranslations("TenderMatching");
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const rawFilters = filtersProp ?? DEFAULT_FILTERS;
  const isRuledOut = view === "ruledOut";

  // Every ruled-out row scores 0, so the score-based controls have no meaning
  // there. Neutralise them on the way to the query rather than teaching the
  // server about the shared filter bar: the server only needs the `view` flag.
  const filters = useMemo<MatchingFiltersState>(() => {
    if (!isRuledOut) return rawFilters;
    return {
      ...rawFilters,
      minScore: 0,
      maxScore: 100,
      quickFilter:
        rawFilters.quickFilter === "high_score" ? null : rawFilters.quickFilter,
      // Sorting by an all-zero column is arbitrary; most-recently-analysed is
      // the useful default.
      sortBy:
        rawFilters.sortBy === "overall_score" ? "created_at" : rawFilters.sortBy,
    };
  }, [isRuledOut, rawFilters]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Reset to page 1 when filters change
  const filtersKey = useMemo(
    () =>
      JSON.stringify([
        view,
        filters.keyword,
        filters.sortBy,
        filters.sortDirection,
        filters.minScore,
        filters.maxScore,
        filters.showApplied,
        filters.quickFilter,
        filters.tenderStatus,
      ]),
    [
      view,
      filters.keyword,
      filters.sortBy,
      filters.sortDirection,
      filters.minScore,
      filters.maxScore,
      filters.showApplied,
      filters.quickFilter,
      filters.tenderStatus,
    ],
  );

  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1));
  }, [filtersKey]);

  // Single unified query: the server merges deep + basic matches, filters out
  // 0% matches, sorts, paginates, and returns counts. The client just renders.
  const {
    data: matchesData,
    isLoading: loading,
    refetch: refetchMatches,
  } = useTenderMatches({
    companyId,
    tenderStatus: filters.tenderStatus || "active",
    keyword: filters.keyword,
    minScore: filters.minScore,
    maxScore: filters.maxScore,
    showApplied: filters.showApplied,
    quickFilter: filters.quickFilter ?? null,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
    page: currentPage,
    pageSize: itemsPerPage,
    view: isRuledOut ? "ruled_out" : undefined,
  });

  const results = useMemo(() => matchesData?.results ?? [], [matchesData]);
  const matchedCount = matchesData?.matchedCount ?? 0;
  const deepAnalyzedCount = matchesData?.deepResearchedCount ?? 0;
  const ruledOutCount = matchesData?.ruledOutCount ?? 0;

  useEffect(() => {
    if (matchesData) onRuledOutCountChange?.(matchesData.ruledOutCount);
  }, [matchesData, onRuledOutCountChange]);

  // Server-driven pagination — counts/pages reflect the matched set the server
  // returns, not a client slice of the full tender universe.
  const totalPages = Math.max(1, Math.ceil(matchedCount / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + results.length, matchedCount);

  // Keep the current page within range when the matched set shrinks.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Whether the user has narrowed results — drives which empty state we show.
  const filtersActive =
    Boolean(filters.keyword) ||
    filters.minScore > 0 ||
    filters.maxScore < 100 ||
    filters.showApplied !== "all" ||
    (filters.quickFilter ?? null) !== null;

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const { data: companyTaxonomyData } = useQuery({
    queryKey: queryKeys.companyTaxonomies(companyId!),
    queryFn: () => api.getCompanyTaxonomies(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: companyStandardsData } = useQuery({
    queryKey: queryKeys.companyStandards(companyId!),
    queryFn: () => api.getCompanyStandards(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: companyCapabilitiesData } = useQuery({
    queryKey: queryKeys.companyCapabilities(companyId!),
    queryFn: () => api.getCompanyCapabilities(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // The `companyData` prop comes from the lean company list projection, which
  // omits heavy JSON fields — including `operationLocations`, `aiCapabilityTaxonomy`
  // and `pendingChanges` (see lib/db/columns.ts). Relying on it made the pre-flight
  // readiness check report Location as "not defined" even when operating locations
  // were set. Fetch the full company record so readiness reflects the real profile.
  const { data: fullCompanyData } = useQuery({
    queryKey: queryKeys.company(companyId!),
    queryFn: () => api.getCompany(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const readinessCompany = useMemo<CompanyRecord | undefined>(
    () => (fullCompanyData?.company as CompanyRecord | undefined) ?? companyData,
    [fullCompanyData?.company, companyData],
  );

  const [deepResearchTenderId, setDeepResearchTenderId] = useState<
    string | null
  >(null);
  // Tracks the single tender behind an in-flight deep-research batch so we can
  // offer a "jump to details" action when it finishes. `deepResearchTenderId` is
  // cleared as soon as the request is queued (before the batch completes), so it
  // can't be used at completion time. Null for bulk "deep research (all)" runs.
  const pendingDeepTenderRef = useRef<string | null>(null);
  const [internalAnalyzing, setInternalAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);
  const [readinessResult, setReadinessResult] = useState<ReadinessResult | null>(null);

  const [matchingUsage, setMatchingUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    resetsAt: string;
  } | null>(null);

  const fetchMatchingUsage = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await api.getCompanyMatchingUsage(companyId);
      setMatchingUsage(data);
    } catch {
      // non-critical; silently ignore
    }
  }, [companyId]);

  useEffect(() => {
    fetchMatchingUsage();
  }, [fetchMatchingUsage]);

  const [matchingProgress, setMatchingProgress] = useState<{
    batchId: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    status: "processing" | "completed" | "failed" | "cancelled";
    progressPercent: number;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const analyzing =
    internalAnalyzing || matchingProgress?.status === "processing";

  const limitReached = matchingUsage != null && matchingUsage.remaining === 0;

  const invalidateMatchingResults = useCallback(() => {
    if (companyId) {
      // Refresh the unified matches list and the saved-tenders view (which still
      // reads from the matching-results query key).
      queryClient.invalidateQueries({
        queryKey: ["tenderMatches", companyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["matchingResults", companyId],
      });
    }
  }, [companyId, queryClient]);

  const cancelMatching = useCallback(
    async (batchId: string) => {
      console.log(`🛑 Cancelling batch ${batchId}...`);
      setIsCancelling(true);

      try {
        const response = await fetch("/api/match-tenders/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        });

        // The cancel endpoint is idempotent: a 2xx (cancelled or already-terminal)
        // and a 404 (batch gone) both mean there is nothing left running, so we
        // converge the UI to "no active batch". Only a real error keeps the
        // progress bar up so the user can retry.
        if (!response.ok && response.status !== 404) {
          const data = await response.json().catch(() => ({}));
          console.warn(`⚠️ Cancel API returned ${response.status}:`, data.error);
          toast.error(data.error || t("cancelError"));
          return;
        }

        if (companyId) {
          localStorage.removeItem(`matching_batch_${companyId}`);
        }
        setMatchingProgress(null);
        toast.success(t("cancelledInfo"));
        refetchMatches();
      } catch (error) {
        console.error("Error calling cancel API:", error);
        toast.error(t("cancelError"));
      } finally {
        setIsCancelling(false);
      }
    },
    [companyId, refetchMatches, t],
  );

  const checkMatchingProgress = useCallback(
    async (batchId: string) => {
      try {
        const response = await fetch(
          `/api/match-tenders/progress?batchId=${batchId}`,
        );
        if (!response.ok) {
          // 404 = the batch is gone; 401/403 = we may not track it. Both are
          // permanent, so stop polling instead of logging on every tick. Other
          // failures (5xx, network) are treated as transient — we keep the
          // current progress and try again rather than assume the job died.
          if (
            response.status === 404 ||
            response.status === 401 ||
            response.status === 403
          ) {
            console.log(
              `Batch ${batchId} unavailable (${response.status}) - clearing progress`,
            );
            if (companyId) {
              localStorage.removeItem(`matching_batch_${companyId}`);
            }
            setMatchingProgress(null);
          } else {
            console.error(
              `Failed to fetch progress for batch ${batchId}:`,
              response.status,
              response.statusText,
            );
          }
          return;
        }

        const data = await response.json();

        if (!data.batchId || data.totalJobs === undefined) {
          console.error("Invalid progress response:", data);
          return;
        }

        if (companyId) {
          const storedBatchId = localStorage.getItem(
            `matching_batch_${companyId}`,
          );
          if (storedBatchId !== batchId) {
            console.warn(
              `Batch ${batchId} doesn't match stored batch ${storedBatchId} for company ${companyId}`,
            );
            localStorage.removeItem(`matching_batch_${companyId}`);
            setMatchingProgress(null);
            return;
          }
        }

        const progressData = {
          batchId: data.batchId,
          totalJobs: data.totalJobs || 0,
          completedJobs: data.completedJobs || 0,
          failedJobs: data.failedJobs || 0,
          status: data.status || "processing",
          progressPercent: data.progressPercent || 0,
        };

        console.log(
          `📊 Progress: ${progressData.completedJobs + progressData.failedJobs}/${progressData.totalJobs} (${progressData.progressPercent}%) - Batch ${batchId.slice(0, 8)}`,
        );
        setMatchingProgress(progressData);

        // The server is the sole authority on whether a batch is done. We only
        // stop tracking when it reports a terminal status — never on a client-side
        // timer. A batch sitting at 0% is still alive on the server and keeps
        // polling until the server reconciles it to a terminal state.
        if (
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "cancelled"
        ) {
          console.log(`Batch ${batchId} finished with status: ${data.status}`);
          if (companyId) {
            localStorage.removeItem(`matching_batch_${companyId}`);
          }
          setMatchingProgress(null);
          invalidateMatchingResults();
          // Consume the single-tender marker (if any) for this batch so we can
          // route the user straight to the result instead of making them scroll.
          const singleTenderId = pendingDeepTenderRef.current;
          pendingDeepTenderRef.current = null;
          if (data.status === "completed") {
            if (singleTenderId) {
              toast.success(t("deepResearchDone"), {
                action: {
                  label: t("viewDetails"),
                  onClick: () =>
                    router.push(
                      `/tenders/${singleTenderId}?companyId=${companyId}`,
                    ),
                },
              });
            } else {
              toast.success(
                t("matchingCompleted", { count: data.completedJobs }),
              );
            }
          } else if (data.status === "cancelled") {
            toast.info(t("cancelledInfo"));
          } else {
            toast.error(t("matchingFailed", { count: data.failedJobs }));
          }
        }
      } catch (error) {
        console.error("Error checking matching progress:", error);
      }
    },
    [companyId, invalidateMatchingResults, router, t],
  );

  const runDeepResearchForTender = useCallback(
    async (tenderId: string) => {
      if (!companyId) return;
      setDeepResearchTenderId(tenderId);
      try {
        const data = await api.triggerDeepMatch(companyId, [tenderId]);
        if (data.status === "all_cached") {
          toast.info(t("deepResearchCached"), {
            action: {
              label: t("viewDetails"),
              onClick: () =>
                router.push(`/tenders/${tenderId}?companyId=${companyId}`),
            },
          });
          invalidateMatchingResults();
          return;
        }
        if (data.batchId && companyId) {
          // Remember which tender this batch is for so the completion handler can
          // surface a "view details" action (see checkMatchingProgress).
          pendingDeepTenderRef.current = tenderId;
          localStorage.setItem(`matching_batch_${companyId}`, data.batchId);
          setMatchingProgress({
            batchId: data.batchId,
            totalJobs: data.jobCount,
            completedJobs: 0,
            failedJobs: 0,
            status: "processing",
            progressPercent: 0,
          });
          checkMatchingProgress(data.batchId);
        }
        toast.success(t("deepResearchQueued"));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("deepResearchError"),
        );
      } finally {
        setDeepResearchTenderId(null);
      }
    },
    [companyId, checkMatchingProgress, invalidateMatchingResults, router, t],
  );

  const refreshAll = useCallback(() => {
    void refetchMatches();
  }, [refetchMatches]);

  // Hydrate the progress bar from the server's authoritative active-batch state.
  // This — not localStorage — decides whether a run is in progress, so a refresh,
  // a second tab, or returning to the page always reflects reality. localStorage
  // is kept only as a non-authoritative hint.
  const hydrateActiveBatch = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch(
        `/api/match-tenders/active?companyId=${companyId}`,
      );
      if (!response.ok) return;
      const data = await response.json();
      const batch = data?.batch;

      if (batch && batch.status === "processing") {
        localStorage.setItem(`matching_batch_${companyId}`, batch.batchId);
        setMatchingProgress({
          batchId: batch.batchId,
          totalJobs: batch.totalJobs ?? 0,
          completedJobs: batch.completedJobs ?? 0,
          failedJobs: batch.failedJobs ?? 0,
          status: "processing",
          progressPercent: batch.progressPercent ?? 0,
        });
      } else {
        // Server reports no active run — clear any stale local progress.
        localStorage.removeItem(`matching_batch_${companyId}`);
        setMatchingProgress((prev) =>
          prev?.status === "processing" ? null : prev,
        );
      }
    } catch {
      // Network hiccup: keep current state, never assume the job died.
    }
  }, [companyId]);

  useEffect(() => {
    if (user && companyId) {
      void hydrateActiveBatch();
    }
  }, [user, companyId, hydrateActiveBatch]);

  // Re-sync with the server whenever the user returns to the tab, so a run that
  // finished (or that was started elsewhere) is reflected without a manual reload.
  useEffect(() => {
    if (!user || !companyId) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void hydrateActiveBatch();
      }
    };
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, companyId, hydrateActiveBatch]);

  const batchId = matchingProgress?.batchId ?? null;
  const isProcessing = matchingProgress?.status === "processing";

  useEffect(() => {
    if (!isProcessing || !batchId) return;

    const interval = setInterval(() => {
      checkMatchingProgress(batchId);
      invalidateMatchingResults();
    }, 5000);

    return () => clearInterval(interval);
  }, [isProcessing, batchId, checkMatchingProgress, invalidateMatchingResults]);

  const startAnalysis = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true;
    setInternalAnalyzing(true);

    try {
      const response = await fetch("/api/match-tenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, force }),
      });

      if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText;
        const responseText = await response.text();

        let errorMessage = "Failed to start matching";
        let parsedData: Record<string, unknown> = {};

        try {
          parsedData = JSON.parse(responseText);
          errorMessage =
            (parsedData.error as string) ||
            (parsedData.message as string) ||
            (parsedData.details as string) ||
            errorMessage;
        } catch (parseError) {
          console.error("Failed to parse error response as JSON:", parseError);
          errorMessage = responseText || `HTTP ${status}: ${statusText}`;
        }

        if (status === 429 && parsedData.limitExceeded) {
          const resetsAt = parsedData.resetsAt
            ? new Date(parsedData.resetsAt as string).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
            : "next month";
          toast.error(t("limitReachedResetsOn", { date: resetsAt }), { duration: 6000 });
          fetchMatchingUsage();
          setInternalAnalyzing(false);
          return;
        }

        console.error("Matching API error:", { status, statusText, body: responseText });
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse success response as JSON:", {
          parseError,
          responseText: responseText.substring(0, 500),
        });
        throw new Error("Invalid response format from server");
      }

      if (data.upToDate) {
        toast.info(
          t("allTendersAlreadyAnalyzed", {
            count: data.skippedCount ?? 0,
          }),
        );
        setInternalAnalyzing(false);
        invalidateMatchingResults();
        return;
      }

      if (data.status === "already_running") {
        console.log(
          `ℹ️ Batch ${data.batchId} already running for this company`,
        );
        toast.info(t("matchingResuming"));
      } else {
        console.log(
          `✅ Created new batch: ${data.batchId} (${data.totalTenders} tenders)`,
        );
        toast.success(t("matchingStarted", { count: data.totalTenders }));
        if (data.skippedCount > 0) {
          toast.info(
            t("matchingSkippedCached", { count: data.skippedCount }),
          );
        }
      }

      if (data.batchId && companyId) {
        const existingBatchId = localStorage.getItem(
          `matching_batch_${companyId}`,
        );
        if (existingBatchId && existingBatchId !== data.batchId) {
          console.log(
            `🔄 Switching from batch ${existingBatchId} to ${data.batchId}`,
          );
        }
        localStorage.setItem(`matching_batch_${companyId}`, data.batchId);
        fetchMatchingUsage();
      }

      setMatchingProgress({
        batchId: data.batchId,
        totalJobs: data.totalTenders,
        completedJobs: 0,
        failedJobs: 0,
        status: "processing",
        progressPercent: 0,
      });

      if (data.batchId) {
        checkMatchingProgress(data.batchId);
      }
    } catch (error) {
      console.error("Error starting matching:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start matching",
      );
    } finally {
      setInternalAnalyzing(false);
    }
  }, [companyId, checkMatchingProgress, fetchMatchingUsage, invalidateMatchingResults, t]);

  const runAnalysis = useCallback(() => {
    if (!companyId) {
      toast.error(t("pleaseSelectCompany"));
      return;
    }

    if (analyzing) {
      toast.info(t("analysisAlreadyInProgress"));
      return;
    }

    if (matchingProgress && matchingProgress.status === "processing") {
      toast.info(t("matchingAlreadyInProgress"));
      return;
    }

    // Pre-flight readiness check
    if (readinessCompany) {
      const readiness = checkMatchingReadiness(readinessCompany, {
        taxonomyCount: companyTaxonomyData?.taxonomies?.length ?? 0,
        standardsCount: companyStandardsData?.standards?.length ?? 0,
        capabilitiesCount: companyCapabilitiesData?.capabilities?.length ?? 0,
      });
      const hasMissingRequired = !readiness.ready;
      const hasMissingRecommended = readiness.fields.some(
        (f) => !f.required && f.status === "missing",
      );
      const hasWarnings = readiness.warnings.length > 0;

      if (hasMissingRequired || hasMissingRecommended || hasWarnings) {
        setReadinessResult(readiness);
        setReadinessDialogOpen(true);
        return;
      }
    }

    startAnalysis({ force: false });
  }, [companyId, readinessCompany, analyzing, matchingProgress, startAnalysis, companyTaxonomyData?.taxonomies?.length, companyStandardsData?.standards?.length, companyCapabilitiesData?.capabilities?.length, t]);

  const runAnalysisFresh = useCallback(() => {
    if (!companyId) {
      toast.error(t("pleaseSelectCompany"));
      return;
    }
    startAnalysis({ force: true });
  }, [companyId, startAnalysis, t]);

  const deleteResult = async (resultId: string) => {
    setDeleting(resultId);
    try {
      await api.deleteMatchingResult(resultId);
      toast.success(t("deleteSuccess"));
      invalidateMatchingResults();
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: ["savedTenders", companyId],
        });
      }
    } catch (error) {
      console.error("Error deleting result:", error);
      toast.error(t("deleteError"));
    } finally {
      setDeleting(null);
    }
  };

  const toggleBookmark = async (resultId: string, currentStatus: boolean) => {
    try {
      await api.toggleBookmark(resultId, !currentStatus);
      toast.success(currentStatus ? t("bookmarkRemoved") : t("bookmarkAdded"));
      invalidateMatchingResults();
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: ["savedTenders", companyId],
        });
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      toast.error(t("bookmarkError"));
    }
  };

  if (!companyId) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          {t("selectCompany")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ruled-out explainer — these results are only reachable deliberately, so
          say up front why they scored 0 and what to do about it. */}
      {isRuledOut && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{t("ruledOutBanner")}</span>
        </div>
      )}

      {/* Results summary */}
      {!loading && matchedCount > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <ResultsHeader
            total={matchedCount}
            start={startIndex + 1}
            end={endIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            loading={loading}
            onRefresh={refreshAll}
            unit={isRuledOut ? t("ruledOutUnit") : t("matchesUnit")}
          />
          {/* Running/re-running analysis belongs to the matched view — the
              ruled-out list is a read-only record of analyses already spent. */}
          {!isRuledOut && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {deepAnalyzedCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("deepAnalyzedCount", { count: deepAnalyzedCount })}
              </span>
            )}
            {matchingUsage && !analyzing && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${limitReached ? "border-destructive/40 text-destructive bg-destructive/5" : "border-muted-foreground/30 text-muted-foreground"}`}>
                      <Zap className="h-3 w-3" />
                      {t("usedThisMonth", { used: matchingUsage.used, limit: matchingUsage.limit })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {limitReached
                      ? t("limitReachedResetsOn", { date: new Date(matchingUsage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) })
                      : t("runsRemaining", { remaining: matchingUsage.remaining, runs: matchingUsage.remaining === 1 ? t("monthlyRun") : t("matchingRuns") })}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button
              onClick={runAnalysis}
              disabled={analyzing || loading || readOnly || limitReached}
              size="sm"
              title={
                readOnly
                  ? t("pendingAccountRestricted")
                  : limitReached
                    ? t("limitReachedDetail", { used: matchingUsage?.used ?? 0, limit: matchingUsage?.limit ?? 0, date: matchingUsage ? new Date(matchingUsage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "" })
                    : analyzing
                      ? t("matchingInProgressDisabled")
                      : undefined
              }
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("analyzing")}
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-2" />
                  {t("deepResearchAll")}
                </>
              )}
            </Button>
            {/* Force re-scoring of ALL tenders — always available (not gated on prior
                analysis) so users can refresh every match after updating their company
                profile. The primary "deep research all" button skips already-analysed
                tenders, so this is the way to pick up profile changes. */}
            {!readOnly ? (
              <Button
                onClick={runAnalysisFresh}
                disabled={analyzing || loading || limitReached}
                size="sm"
                variant="outline"
              >
                {t("reRunDeepResearchAll")}
              </Button>
            ) : null}
          </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {matchingProgress && matchingProgress.status === "processing" && (
        <div className="mb-4 p-4 bg-muted rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-medium">{t("matchingInProgress")}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {matchingProgress.completedJobs} / {matchingProgress.totalJobs}{" "}
                {t("tenders")}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMatching(matchingProgress.batchId)}
                disabled={isCancelling}
                className="h-7"
              >
                {isCancelling ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <X className="h-3 w-3 mr-1" />
                )}
                {isCancelling ? t("cancelling") : t("cancel")}
              </Button>
            </div>
          </div>
          <Progress value={matchingProgress.progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {t("analyzingProgress", { percent: matchingProgress.progressPercent })}
            {matchingProgress.failedJobs > 0 &&
              ` ${t("failedCount", { count: matchingProgress.failedJobs })}`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{t("loading")}</span>
        </div>
      ) : matchedCount === 0 && isRuledOut ? (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {filtersActive ? t("noResultsTitle") : t("noRuledOutTitle")}
          </h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            {filtersActive
              ? t("noResultsFiltered")
              : t("noRuledOutDescription")}
          </p>
          {onViewChange && (
            <Button variant="outline" onClick={() => onViewChange("matched")}>
              {t("backToMatches")}
            </Button>
          )}
        </div>
      ) : matchedCount === 0 ? (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {filtersActive ? t("noResultsTitle") : t("noMatchesTitle")}
          </h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            {filtersActive
              ? t("noResultsFiltered")
              : deepAnalyzedCount > 0
                ? t("noStrongMatches", { count: deepAnalyzedCount })
                : t("noResultsDescriptionBasic")}
          </p>
          {deepAnalyzedCount > 0 && !filtersActive && (
            <p className="text-xs text-muted-foreground mb-4">
              {t("deepAnalyzedCount", { count: deepAnalyzedCount })}
            </p>
          )}
          {/* Primary discovery path: a user whose whole run came back empty is
              exactly who needs to know the ruled-out list exists. */}
          {ruledOutCount > 0 && !filtersActive && onViewChange && (
            <div className="mb-4">
              <Button
                variant="outline"
                onClick={() => onViewChange("ruledOut")}
              >
                <EyeOff className="w-4 h-4 mr-2" />
                {t("viewRuledOutCta", { count: ruledOutCount })}
              </Button>
            </div>
          )}
          {!filtersActive && !readOnly && (
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={refreshAll}
                disabled={loading}
                variant="outline"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {t("refreshBasicMatches")}
              </Button>
              <Button
                onClick={runAnalysis}
                disabled={analyzing || limitReached}
                title={
                  limitReached
                    ? t("limitReachedDetail", { used: matchingUsage?.used ?? 0, limit: matchingUsage?.limit ?? 0, date: matchingUsage ? new Date(matchingUsage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "" })
                    : undefined
                }
              >
                <Target className="w-4 h-4 mr-2" />
                {analyzing ? t("analyzing") : t("deepResearchAll")}
              </Button>
              {matchingUsage && (
                <span className={`flex items-center gap-1 text-xs ${limitReached ? "text-destructive" : "text-muted-foreground"}`}>
                  <Zap className="h-3 w-3" />
                  {limitReached
                    ? t("limitReachedShort", { used: matchingUsage.used, limit: matchingUsage.limit, date: new Date(matchingUsage.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) })
                    : t("usedMatchingRuns", { used: matchingUsage.used, limit: matchingUsage.limit })}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {results.map((m) => {
              const viewDetails = () =>
                router.push(`/tenders/${m.tenderId}?companyId=${companyId}`);
              if (m.variant === "deep") {
                return (
                  <TenderMatchCard
                    key={m.resultId ?? m.tenderId}
                    variant="deep"
                    tenderId={m.tenderId}
                    title={m.title}
                    buyer={m.buyer}
                    location={m.location}
                    description={m.description}
                    deadline={m.deadline}
                    status={m.status}
                    budgetMin={m.budgetMin}
                    budgetMax={m.budgetMax}
                    currency={m.currency}
                    score={m.score}
                    capabilityScore={m.capabilityScore}
                    experienceScore={m.experienceScore}
                    locationScore={m.locationScore}
                    certificationScore={m.certificationScore}
                    matchReasons={m.matchReasons}
                    isBookmarked={m.isBookmarked}
                    isApplied={m.isApplied}
                    ruledOut={isRuledOut}
                    onViewDetails={viewDetails}
                    // A synthesized card has no matching_results row behind it,
                    // so there is nothing to bookmark or delete — the card hides
                    // both actions when the handlers are absent.
                    onBookmark={
                      m.resultId
                        ? () => toggleBookmark(m.resultId!, m.isBookmarked)
                        : undefined
                    }
                    onDelete={
                      m.resultId ? () => deleteResult(m.resultId!) : undefined
                    }
                    isDeleting={!!m.resultId && deleting === m.resultId}
                    readOnly={readOnly}
                  />
                );
              }
              return (
                <TenderMatchCard
                  key={m.tenderId}
                  variant="basic"
                  tenderId={m.tenderId}
                  title={m.title}
                  buyer={m.buyer}
                  location={m.location}
                  description={m.description}
                  deadline={m.deadline}
                  status={m.status}
                  budgetMin={m.budgetMin}
                  budgetMax={m.budgetMax}
                  currency={m.currency}
                  score={m.score}
                  onViewDetails={viewDetails}
                  onDeepResearch={() => runDeepResearchForTender(m.tenderId)}
                  deepResearchPending={deepResearchTenderId === m.tenderId}
                  readOnly={readOnly}
                />
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("previous")}
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <Button
                          key={page}
                          variant={page === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(page)}
                          disabled={loading}
                          className="min-w-[40px]"
                        >
                          {page}
                        </Button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return (
                        <span
                          key={page}
                          className="px-2 text-muted-foreground"
                        >
                          ...
                        </span>
                      );
                    }
                    return null;
                  },
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
              >
                {t("next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
      {/* Readiness Dialog */}
      {readinessResult && companyId && (
        <MatchingReadinessDialog
          open={readinessDialogOpen}
          onOpenChange={setReadinessDialogOpen}
          companyId={companyId}
          readiness={readinessResult}
          onRunAnyway={() => startAnalysis({ force: false })}
        />
      )}
    </div>
  );
}
