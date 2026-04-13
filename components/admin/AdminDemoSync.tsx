"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Play,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

type DemoModel = "gpt-5-nano";

/** GPT-5 nano thinking level: lower = faster, fewer reasoning tokens. "default" = API default. */
type ReasoningEffortOption =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

interface DemoRow {
  id: string;
  createdAt: string;
  batchLabel: string;
  companyId: string;
  tenderId: string;
  modelUsed: string;
  overallScore: number | null;
  capabilityScore: number | null;
  experienceScore: number | null;
  locationScore: number | null;
  certificationScore: number | null;
  matchReasons: string[] | null;
  improvementSuggestions: string[] | null;
  aiAnalysis: unknown;
  tenderTitle?: string;
  companyName?: string;
}

export function AdminDemoSync() {
  const t = useTranslations("AdminDemoSync");
  const [model, setModel] = useState<DemoModel>("gpt-5-nano");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffortOption>("default");
  const [results, setResults] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Run timer: track current run and last completed run for model comparison
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [runEndTime, setRunEndTime] = useState<number | null>(null);
  const [runBatchId, setRunBatchId] = useState<string | null>(null);
  const [runModel, setRunModel] = useState<DemoModel | null>(null);
  const [lastRunDurationMs, setLastRunDurationMs] = useState<number | null>(
    null,
  );
  const [lastRunModel, setLastRunModel] = useState<DemoModel | null>(null);
  const [_elapsedTick, setElapsedTick] = useState(0); // force re-render every second for live timer
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Progress for current run: completed / total (e.g. 32/50)
  const [runTotalJobs, setRunTotalJobs] = useState<number | null>(null);
  const [runCompletedJobs, setRunCompletedJobs] = useState<number | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/demo-sync/results");
      if (!res.ok) throw new Error("Failed to fetch results");
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.fetchError"));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  // Live elapsed timer: update every second while a run is in progress
  useEffect(() => {
    if (runStartTime == null || runEndTime != null) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }
    timerIntervalRef.current = setInterval(
      () => setElapsedTick((t) => t + 1),
      1000,
    );
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [runStartTime, runEndTime]);

  // Poll batch status when we have an active run; when completed/failed, record end time
  useEffect(() => {
    if (!runBatchId) return;
    const check = async () => {
      try {
        const res = await fetch(`/api/queue/job-status?batchId=${runBatchId}`);
        if (!res.ok) return;
        const data = await res.json();
        const batch = data.batch;
        if (batch != null) {
          setRunCompletedJobs(batch.completedJobs ?? 0);
          setRunTotalJobs((prev) => batch.totalJobs ?? prev ?? 0);
        }
        const status = batch?.status;
        if (status === "completed" || status === "failed") {
          const end = Date.now();
          setRunEndTime(end);
          if (runStartTime != null) {
            setLastRunDurationMs(end - runStartTime);
            setLastRunModel(runModel ?? null);
          }
          setRunBatchId(null);
          setRunTotalJobs(null);
          setRunCompletedJobs(null);
          if (status === "completed") {
            toast.success(
              t("toasts.demoFinished", {
                duration: formatDurationMs(end - (runStartTime ?? end)),
                model: runModel ?? "model",
              }),
            );
          }
        }
      } catch {
        // ignore
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [runBatchId, runStartTime, runModel, t]);

  const handleRunDemo = async () => {
    setRunLoading(true);
    try {
      const res = await fetch("/api/admin/demo-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          tenderCount: 50,
          ...(model === "gpt-5-nano" &&
            reasoningEffort &&
            reasoningEffort !== "default" && { reasoningEffort }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("toasts.runFailed"));
      setRunStartTime(Date.now());
      setRunEndTime(null);
      setRunBatchId(data.batchId ?? null);
      setRunModel(model);
      setRunTotalJobs(data.jobCount ?? 50);
      setRunCompletedJobs(0);
      toast.success(t("toasts.demoStarted", { count: data.jobCount }));
      fetchResults();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.runFailed"));
    } finally {
      setRunLoading(false);
    }
  };

  const handleAddUser = async () => {
    setAddUserLoading(true);
    try {
      const res = await fetch("/api/admin/demo-sync/add-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchCount: 50,
          model,
          ...(model === "gpt-5-nano" &&
            reasoningEffort &&
            reasoningEffort !== "default" && { reasoningEffort }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("toasts.addUserFailed"));
      toast.success(t("toasts.addUserSuccess", { count: data.jobCount }));
      fetchResults();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.addUserFailed"));
    } finally {
      setAddUserLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("cardDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Run timer: live elapsed while running, then last run duration for comparison */}
          {(runStartTime != null || lastRunDurationMs != null) && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Timer className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {runStartTime != null && runEndTime == null && (
                    <span>
                      <strong>{t("runTimerLabel")}</strong>{" "}
                      {formatDurationMs(Date.now() - runStartTime)}
                      {runModel && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({runModel})
                        </span>
                      )}
                    </span>
                  )}
                  {lastRunDurationMs != null && (
                    <span>
                      <strong>{t("lastRunLabel")}</strong>{" "}
                      {formatDurationMs(lastRunDurationMs)}
                      {lastRunModel && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({lastRunModel})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {/* Progress bar: completed / total (e.g. 32/50) */}
              {runBatchId != null &&
                runTotalJobs != null &&
                runTotalJobs > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("queueProgress")}</span>
                      <span className="font-medium tabular-nums">
                        {runCompletedJobs ?? 0} / {runTotalJobs}
                      </span>
                    </div>
                    <Progress
                      value={
                        Math.min(
                          100,
                          ((runCompletedJobs ?? 0) / runTotalJobs) * 100,
                        )
                      }
                      className="h-2"
                    />
                  </div>
                )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t("modelLabel")}</span>
              <Select
                value={model}
                onValueChange={(v) => setModel(v as DemoModel)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-5-nano">GPT-5 nano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {model === "gpt-5-nano" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("thinkingLabel")}</span>
                <Select
                  value={reasoningEffort}
                  onValueChange={(v) =>
                    setReasoningEffort(v as ReasoningEffortOption)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder={t("effort.default")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("effort.default")}</SelectItem>
                    <SelectItem value="low">{t("effort.low")}</SelectItem>
                    <SelectItem value="minimal">{t("effort.minimal")}</SelectItem>
                    <SelectItem value="none">{t("effort.none")}</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{t("thinkingHint")}</span>
              </div>
            )}
            <Button
              onClick={handleRunDemo}
              disabled={runLoading}
              className="gap-2"
            >
              {runLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {t("runDemoButton")}
            </Button>
            <Button
              variant="secondary"
              onClick={handleAddUser}
              disabled={addUserLoading}
              className="gap-2"
            >
              {addUserLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {t("addUserButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("resultsTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("resultsDescription")}</p>
        </CardHeader>
        <CardContent>
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t("loadingResults")}</span>
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">{t("emptyResults")}</p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.batch")}</TableHead>
                    <TableHead>{t("table.tender")}</TableHead>
                    <TableHead>{t("table.company")}</TableHead>
                    <TableHead className="text-right">{t("table.score")}</TableHead>
                    <TableHead>{t("table.model")}</TableHead>
                    <TableHead>{t("table.summary")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => {
                    const aiAnalysis = row.aiAnalysis as {
                      analysis?: string;
                    } | null;
                    const summary =
                      aiAnalysis?.analysis ??
                      (Array.isArray(row.matchReasons)
                        ? row.matchReasons.join("; ")
                        : "-");
                    const isExpanded = expandedId === row.id;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge
                            variant={
                              row.batchLabel === "User A"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {row.batchLabel}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate"
                          title={row.tenderTitle ?? row.tenderId}
                        >
                          {row.tenderTitle ?? row.tenderId}
                        </TableCell>
                        <TableCell
                          className="max-w-[150px] truncate"
                          title={row.companyName ?? row.companyId}
                        >
                          {row.companyName ?? row.companyId}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {row.overallScore ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.modelUsed}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <span className="line-clamp-2 text-sm">
                            {String(summary).slice(0, 120)}…
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : row.id)
                            }
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {results.some((r) => expandedId === r.id) && (
                <div className="border-t p-4 bg-muted/30">
                  {results
                    .filter((r) => r.id === expandedId)
                    .map((row) => (
                      <div key={row.id} className="space-y-2 text-sm">
                        <p className="font-medium">
                          {t("rawAiOutput", { batch: row.batchLabel, model: row.modelUsed })}
                        </p>
                        <pre className="whitespace-pre-wrap wrap-break-word rounded bg-background p-3 text-xs max-h-[300px] overflow-auto">
                          {JSON.stringify(row.aiAnalysis, null, 2)}
                        </pre>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
