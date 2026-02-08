"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

type DemoModel = "gpt-5-nano" | "gemini-2.5-flash-lite";

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
  created_at: string;
  batch_label: string;
  company_id: string;
  tender_id: string;
  model_used: string;
  overall_score: number | null;
  capability_score: number | null;
  experience_score: number | null;
  location_score: number | null;
  certification_score: number | null;
  match_reasons: string[] | null;
  improvement_suggestions: string[] | null;
  ai_analysis: unknown;
  tender_title?: string;
  company_name?: string;
}

export function AdminDemoSync() {
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
      toast.error(e instanceof Error ? e.message : "Failed to load results");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
              `Demo run finished in ${formatDurationMs(end - (runStartTime ?? end))} (${runModel ?? "model"})`,
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
  }, [runBatchId, runStartTime, runModel]);

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
      if (!res.ok) throw new Error(data.error || "Run failed");
      setRunStartTime(Date.now());
      setRunEndTime(null);
      setRunBatchId(data.batchId ?? null);
      setRunModel(model);
      setRunTotalJobs(data.jobCount ?? 50);
      setRunCompletedJobs(0);
      toast.success(
        `Demo started: ${data.jobCount} jobs queued (User A). Results will appear below.`,
      );
      fetchResults();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
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
      if (!res.ok) throw new Error(data.error || "Add user failed");
      toast.success(
        `Added User B: ${data.jobCount} jobs queued. Total queue has more jobs.`,
      );
      fetchResults();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add user failed");
    } finally {
      setAddUserLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test mode: demo sync &amp; match</CardTitle>
          <p className="text-sm text-muted-foreground">
            Run a demo match of 50 tenders and compare models. Results are
            stored in a separate table and truncated on each &quot;Run
            demo&quot;. Use &quot;Add user to queue&quot; to simulate a second
            user (100 matches total).
          </p>
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
                      <strong>Run timer:</strong>{" "}
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
                      <strong>Last run:</strong>{" "}
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
                      <span className="text-muted-foreground">
                        Queue progress
                      </span>
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
              <span className="text-sm font-medium">Model:</span>
              <Select
                value={model}
                onValueChange={(v) => setModel(v as DemoModel)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-5-nano">GPT-5 nano</SelectItem>
                  <SelectItem value="gemini-2.5-flash-lite">
                    Gemini 2.5 Flash-Lite
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {model === "gpt-5-nano" && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Thinking:</span>
                <Select
                  value={reasoningEffort}
                  onValueChange={(v) =>
                    setReasoningEffort(v as ReasoningEffortOption)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="minimal">Very low</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Lower = faster
                </span>
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
              Run demo (50 tenders)
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
              Add user to queue (+50 matches)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demo results</CardTitle>
          <p className="text-sm text-muted-foreground">
            Match result, model used, and AI summary. Rows appear as jobs
            complete (polling every 5s).
          </p>
        </CardHeader>
        <CardContent>
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading results...</span>
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No demo results yet. Run a demo to see matches here.
            </p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Tender</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => {
                    const aiAnalysis = row.ai_analysis as {
                      analysis?: string;
                    } | null;
                    const summary =
                      aiAnalysis?.analysis ??
                      (Array.isArray(row.match_reasons)
                        ? row.match_reasons.join("; ")
                        : "-");
                    const isExpanded = expandedId === row.id;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge
                            variant={
                              row.batch_label === "User A"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {row.batch_label}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate"
                          title={row.tender_title ?? row.tender_id}
                        >
                          {row.tender_title ?? row.tender_id}
                        </TableCell>
                        <TableCell
                          className="max-w-[150px] truncate"
                          title={row.company_name ?? row.company_id}
                        >
                          {row.company_name ?? row.company_id}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {row.overall_score ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.model_used}</Badge>
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
                          Raw AI output (batch: {row.batch_label}, model:{" "}
                          {row.model_used})
                        </p>
                        <pre className="whitespace-pre-wrap wrap-break-word rounded bg-background p-3 text-xs max-h-[300px] overflow-auto">
                          {JSON.stringify(row.ai_analysis, null, 2)}
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
