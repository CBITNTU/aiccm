"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useMatchingResults } from "@/hooks/useMatchingResults";
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
} from "lucide-react";
import { toast } from "sonner";
import { TenderMatchCard } from "./TenderMatchCard";
import { BasicTenderMatchCard } from "./BasicTenderMatchCard";
import { ResultsHeader } from "./ResultsHeader";
import { MatchingReadinessDialog } from "./MatchingReadinessDialog";
import { checkMatchingReadiness, type ReadinessResult } from "@/lib/matchingReadiness";
import { queryKeys } from "@/lib/queryKeys";
import type { CompanyRecord, TenderRecord } from "@/lib/api/types";

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

interface MatchingResult {
  id: string;
  tenderId: string;
  companyId: string;
  overallScore: number;
  capabilityScore: number;
  experienceScore: number;
  locationScore: number;
  certificationScore: number;
  matchReasons: string[] | null;
  improvementSuggestions: string[];
  aiAnalysis: Record<string, unknown>;
  isBookmarked: boolean;
  isApplied: boolean;
  createdAt: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budgetMin: number;
    budgetMax: number;
    status: string;
  };
}

interface TenderMatchingProps {
  companyId?: string;
  companyData?: CompanyRecord;
  filters?: MatchingFiltersState;
  onCreateProject?: (tenderId: string) => void;
  readOnly?: boolean;
}

export function TenderMatching({
  companyId,
  companyData,
  filters: filtersProp,
  onCreateProject: _onCreateProject,
  readOnly = false,
}: TenderMatchingProps) {
  const t = useTranslations("TenderMatching");
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const filters = filtersProp ?? DEFAULT_FILTERS;

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Reset to page 1 when filters change
  const filtersKey = useMemo(
    () =>
      JSON.stringify([
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

  const {
    data: matchingData,
    isLoading: deepLoading,
    refetch: refetchMatchingResults,
  } = useMatchingResults({
    companyId,
    tenderStatus: filters.tenderStatus || "active",
    keyword: filters.keyword,
    minScore: 0,
    maxScore: 100,
    showApplied: "all",
    quickFilter: null,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
    page: 1,
    pageSize: 500,
  });

  const matchingResults = useMemo(
    () => (matchingData?.results as unknown as MatchingResult[]) ?? [],
    [matchingData],
  );
  const deepAnalyzedCount = matchingData?.totalCount ?? matchingResults.length;

  const tenderSearchStatus =
    filters.tenderStatus === "active" || !filters.tenderStatus
      ? undefined
      : filters.tenderStatus === "all"
        ? "all"
        : filters.tenderStatus;

  const {
    data: tendersData,
    isLoading: tendersLoading,
    refetch: refetchTenders,
  } = useQuery({
    queryKey: queryKeys.tenders({
      context: "matches-tab",
      companyId,
      page: currentPage,
      filtersKey,
    }),
    queryFn: () =>
      api.searchTenders({
        keyword: filters.keyword,
        ...(tenderSearchStatus && tenderSearchStatus !== "all"
          ? { status: tenderSearchStatus }
          : {}),
        page: currentPage,
        pageSize: itemsPerPage,
        sortBy:
          filters.sortBy === "overall_score" ||
          filters.sortBy === "capability_score" ||
          filters.sortBy === "experience_score" ||
          filters.sortBy === "location_score" ||
          filters.sortBy === "certification_score" ||
          filters.sortBy === "created_at"
            ? "deadline"
            : filters.sortBy,
        sortDirection: filters.sortDirection,
      }),
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const allTenders = useMemo(
    () => (tendersData?.tenders as TenderRecord[]) ?? [],
    [tendersData],
  );

  const {
    data: basicData,
    isLoading: basicLoading,
    refetch: refetchBasicMatch,
  } = useQuery({
    queryKey: queryKeys.basicMatchForCompany(companyId!, {
      overlay: true,
    }),
    queryFn: () =>
      api.basicMatch({
        mode: "tenders-for-company",
        companyId: companyId!,
        limit: 500,
        minScore: 0,
      }),
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  const basicMatches = useMemo(
    () => basicData?.results ?? [],
    [basicData?.results],
  );

  const deepByTenderId = useMemo(() => {
    const map = new Map<string, MatchingResult>();
    for (const r of matchingResults) {
      map.set(r.tenderId, r);
    }
    return map;
  }, [matchingResults]);

  const basicByTenderId = useMemo(() => {
    const map = new Map<string, (typeof basicMatches)[number]>();
    for (const b of basicMatches) {
      if (b.tenderId) map.set(b.tenderId, b);
    }
    return map;
  }, [basicMatches]);

  const displayTenders = useMemo(() => {
    let rows = allTenders;

    if (filters.minScore > 0 || filters.maxScore < 100) {
      rows = rows.filter((tender) => {
        const deep = deepByTenderId.get(tender.id);
        if (deep) {
          return (
            deep.overallScore >= filters.minScore &&
            deep.overallScore <= filters.maxScore
          );
        }
        const basic = basicByTenderId.get(tender.id);
        const pct = Math.round((basic?.similarity ?? 0) * 100);
        return pct >= filters.minScore && pct <= filters.maxScore;
      });
    }

    if (filters.showApplied === "applied") {
      rows = rows.filter((t) => deepByTenderId.get(t.id)?.isApplied);
    } else if (filters.showApplied === "not_applied") {
      rows = rows.filter((t) => {
        const deep = deepByTenderId.get(t.id);
        return !deep || !deep.isApplied;
      });
    } else if (filters.showApplied === "bookmarked") {
      rows = rows.filter((t) => deepByTenderId.get(t.id)?.isBookmarked);
    }

    if (filters.quickFilter === "high_score") {
      rows = rows.filter((t) => {
        const deep = deepByTenderId.get(t.id);
        if (deep) return deep.overallScore >= 80;
        const basic = basicByTenderId.get(t.id);
        return (basic?.similarity ?? 0) >= 0.8;
      });
    } else if (filters.quickFilter === "urgent") {
      const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
      rows = rows.filter((t) => {
        if (!t.deadline) return false;
        const d = new Date(t.deadline).getTime();
        return d >= Date.now() && d <= sevenDays;
      });
    } else if (filters.quickFilter === "high_value") {
      rows = rows.filter(
        (t) => (t.budgetMax ?? 0) >= 1_000_000 || (t.budgetMin ?? 0) >= 1_000_000,
      );
    }

    if (
      filters.sortBy === "overall_score" ||
      filters.sortBy === "capability_score" ||
      filters.sortBy === "experience_score" ||
      filters.sortBy === "location_score" ||
      filters.sortBy === "certification_score"
    ) {
      const scoreKey = filters.sortBy.replace("_score", "") as
        | "overall"
        | "capability"
        | "experience"
        | "location"
        | "certification";
      const dir = filters.sortDirection === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const scoreFor = (t: TenderRecord) => {
          const deep = deepByTenderId.get(t.id);
          if (deep) {
            if (scoreKey === "overall") return deep.overallScore ?? 0;
            if (scoreKey === "capability") return deep.capabilityScore ?? 0;
            if (scoreKey === "experience") return deep.experienceScore ?? 0;
            if (scoreKey === "location") return deep.locationScore ?? 0;
            return deep.certificationScore ?? 0;
          }
          const basic = basicByTenderId.get(t.id);
          return Math.round((basic?.similarity ?? 0) * 100);
        };
        return (scoreFor(a) - scoreFor(b)) * dir;
      });
    }

    return rows;
  }, [
    allTenders,
    filters.minScore,
    filters.maxScore,
    filters.showApplied,
    filters.quickFilter,
    filters.sortBy,
    filters.sortDirection,
    deepByTenderId,
    basicByTenderId,
  ]);

  const totalCount = tendersData?.totalCount ?? 0;

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + displayTenders.length, totalCount);

  const loading =
    (tendersLoading && allTenders.length === 0) ||
    (basicLoading && basicMatches.length === 0 && allTenders.length === 0);

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

  const [deepResearchTenderId, setDeepResearchTenderId] = useState<
    string | null
  >(null);
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
    status: "processing" | "completed" | "failed";
    progressPercent: number;
  } | null>(null);

  const analyzing =
    internalAnalyzing || matchingProgress?.status === "processing";

  const limitReached = matchingUsage != null && matchingUsage.remaining === 0;

  const invalidateMatchingResults = useCallback(() => {
    if (companyId) {
      queryClient.invalidateQueries({
        queryKey: ["matchingResults", companyId],
      });
    }
  }, [companyId, queryClient]);

  const cancelMatching = useCallback(
    async (batchId: string) => {
      console.log(`🛑 Attempting to cancel batch ${batchId}...`);

      try {
        const response = await fetch("/api/match-tenders/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Successfully cancelled batch ${batchId}:`, data);
        } else if (response.status === 404) {
          console.log(
            `⚠️ Batch ${batchId} not found (404) - may already be completed or never existed`,
          );
        } else {
          const data = await response.json();
          console.warn(
            `⚠️ Cancel API returned ${response.status}:`,
            data.error,
          );
        }
      } catch (error) {
        console.error("Error calling cancel API:", error);
      }

      if (companyId) {
        localStorage.removeItem(`matching_batch_${companyId}`);
        localStorage.removeItem(`stale_check_${batchId}`);

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("stale_check_")) {
            localStorage.removeItem(key);
          }
        }
      }

      setMatchingProgress(null);

      console.log(`✅ Cleared all local state for company ${companyId}`);
      toast.success(t("cancelledInfo"));

      setTimeout(() => {
        refetchMatchingResults();
      }, 2000);
    },
    [companyId, refetchMatchingResults, t],
  );

  const checkMatchingProgress = useCallback(
    async (batchId: string) => {
      try {
        const response = await fetch(
          `/api/match-tenders/progress?batchId=${batchId}`,
        );
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`Batch ${batchId} not found (404) - clearing progress`);
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

        if (data.status === "completed" || data.status === "failed") {
          console.log(`Batch ${batchId} finished with status: ${data.status}`);
          if (companyId) {
            localStorage.removeItem(`matching_batch_${companyId}`);
          }
          setMatchingProgress(null);
          invalidateMatchingResults();
          void refetchBasicMatch();
          if (data.status === "completed") {
            toast.success(t("matchingCompleted", { count: data.completedJobs }));
          } else {
            toast.error(t("matchingFailed", { count: data.failedJobs }));
          }
        }

        if (
          data.status === "processing" &&
          data.completedJobs === 0 &&
          data.failedJobs === 0
        ) {
          const staleCheckKey = `stale_check_${batchId}`;
          const firstCheckTime = localStorage.getItem(staleCheckKey);

          if (!firstCheckTime) {
            localStorage.setItem(staleCheckKey, Date.now().toString());
          } else {
            const elapsed = Date.now() - parseInt(firstCheckTime);
            if (elapsed > 60000) {
              console.warn(
                `⚠️ Batch ${batchId} stuck at 0 progress for ${Math.round(elapsed / 1000)}s - auto-clearing`,
              );
              if (companyId) {
                localStorage.removeItem(`matching_batch_${companyId}`);
              }
              localStorage.removeItem(staleCheckKey);
              setMatchingProgress(null);
              toast.info(t("stuckInfo"));
              return;
            }
          }
        } else if (data.completedJobs > 0 || data.failedJobs > 0) {
          localStorage.removeItem(`stale_check_${batchId}`);
        }
      } catch (error) {
        console.error("Error checking matching progress:", error);
      }
    },
    [companyId, invalidateMatchingResults, refetchBasicMatch, t],
  );

  const runDeepResearchForTender = useCallback(
    async (tenderId: string) => {
      if (!companyId) return;
      if (deepByTenderId.has(tenderId)) {
        toast.info(t("deepResearchCached"));
        return;
      }
      setDeepResearchTenderId(tenderId);
      try {
        const data = await api.triggerDeepMatch(companyId, [tenderId]);
        if (data.status === "all_cached") {
          toast.info(t("deepResearchCached"));
          invalidateMatchingResults();
          return;
        }
        if (data.batchId && companyId) {
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
    [companyId, checkMatchingProgress, deepByTenderId, invalidateMatchingResults, t],
  );

  const refreshAll = useCallback(() => {
    void refetchTenders();
    void refetchBasicMatch();
    void refetchMatchingResults();
  }, [refetchTenders, refetchBasicMatch, refetchMatchingResults]);

  useEffect(() => {
    if (user && companyId) {
      const storedBatchId = localStorage.getItem(`matching_batch_${companyId}`);
      if (storedBatchId) {
        console.log(`🔄 Restoring batch from localStorage: ${storedBatchId}`);
        checkMatchingProgress(storedBatchId);
      }
    }
  }, [user, companyId, checkMatchingProgress]);

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

    if (companyId) {
      const oldBatchId = localStorage.getItem(`matching_batch_${companyId}`);
      if (oldBatchId) {
        console.log(
          `🧹 Clearing old batch ${oldBatchId} before starting new one`,
        );
        localStorage.removeItem(`stale_check_${oldBatchId}`);
      }
    }

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
    if (companyData) {
      const readiness = checkMatchingReadiness(companyData, {
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
  }, [companyId, companyData, analyzing, matchingProgress, startAnalysis, companyTaxonomyData?.taxonomies?.length, companyStandardsData?.standards?.length, companyCapabilitiesData?.capabilities?.length, t]);

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
      {/* Results summary */}
      {!loading && totalCount > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <ResultsHeader
            total={totalCount}
            start={startIndex + 1}
            end={endIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            loading={loading || deepLoading}
            onRefresh={refreshAll}
          />
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
            {deepAnalyzedCount > 0 && !readOnly ? (
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
                className="h-7"
              >
                <X className="h-3 w-3 mr-1" />
                {matchingProgress.completedJobs === 0 &&
                matchingProgress.failedJobs === 0
                  ? t("clearAndRestart")
                  : t("cancel")}
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
      ) : displayTenders.length === 0 ? (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {t("noResultsTitle")}
          </h3>
          <p className="text-muted-foreground mb-4">
            {totalCount === 0 && currentPage === 1
              ? t("noResultsDescriptionBasic")
              : t("noResultsFiltered")}
          </p>
          {totalCount === 0 && currentPage === 1 && !readOnly && (
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={refreshAll}
                disabled={basicLoading}
                variant="outline"
              >
                {basicLoading ? (
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
            {displayTenders.map((tender) => {
              const tenderId = tender.id;
              const deep = deepByTenderId.get(tenderId);
              if (deep) {
                return (
                  <TenderMatchCard
                    key={deep.id}
                    result={deep}
                    onViewDetails={() => {
                      router.push(
                        `/tenders/${tenderId}?companyId=${companyId}`,
                      );
                    }}
                    onBookmark={() =>
                      toggleBookmark(deep.id, deep.isBookmarked)
                    }
                    onDelete={() => deleteResult(deep.id)}
                    isDeleting={deleting === deep.id}
                    readOnly={readOnly}
                  />
                );
              }
              const basic = basicByTenderId.get(tenderId);
              return (
                <BasicTenderMatchCard
                  key={tenderId}
                  match={{
                    tenderId,
                    title: tender.title,
                    buyer: tender.buyer ?? "",
                    location: tender.location ?? null,
                    deadline: tender.deadline ?? null,
                    status: tender.status ?? null,
                    similarity: basic?.similarity ?? 0,
                    band: (basic?.band as "high" | "medium" | "low") ?? "low",
                  }}
                  companyId={companyId!}
                  onDeepResearch={() => runDeepResearchForTender(tenderId)}
                  deepResearchPending={deepResearchTenderId === tenderId}
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
