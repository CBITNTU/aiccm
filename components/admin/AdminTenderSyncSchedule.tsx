"use client";

import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAdminTenderSync } from "@/components/admin/AdminTenderSyncContext";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AdminTenderSyncSchedule() {
  const queryClient = useQueryClient();
  const { setSyncInProgress, setStopSyncFn, stopSync } = useAdminTenderSync();
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    data: schedule,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.tenderSyncStatus(),
    queryFn: () => api.getTenderSyncStatus(),
    staleTime: 30 * 1000,
  });

  const triggerSync = useMutation({
    mutationFn: () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setStopSyncFn(() => controller.abort());
      setSyncInProgress(true);
      return api.triggerTenderSync({ signal: controller.signal });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenderSyncStatus() });
      if (data.ran) {
        if (data.syncSucceeded) {
          toast.success("Sync completed. Next run in 7 days.");
        } else {
          toast.warning(
            "Sync failed (see server logs). Next run scheduled in 7 days.",
          );
        }
      } else {
        toast.success(data.message ?? "Sync not run");
      }
    },
    onError: (err: Error) => {
      const isAborted =
        err.name === "AbortError" ||
        (err instanceof Error && err.message?.includes("abort"));
      if (isAborted) {
        toast.info("Sync stopped.");
      } else {
        toast.error(err.message ?? "Failed to trigger sync");
      }
    },
    onSettled: () => {
      abortControllerRef.current = null;
      setStopSyncFn(null);
      setSyncInProgress(false);
    },
  });

  const lastSync = schedule?.lastSyncFinishedAt ?? null;
  const nextSync = schedule?.nextSyncScheduledAt ?? null;
  const isTriggering = triggerSync.isPending;
  const isBusy = isLoading || isTriggering;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="w-4 h-4" aria-hidden />
          Weekly Tender Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="text-sm grid gap-1"
          aria-live="polite"
          aria-busy={isBusy}
          aria-label="Tender sync schedule status"
        >
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-destructive">
              {error instanceof Error ? error.message : "Failed to load status"}
            </p>
          ) : (
            <>
              <p>
                <span className="text-muted-foreground">
                  Last sync finished:
                </span>{" "}
                {lastSync ? formatDateTime(lastSync) : "Never"}
              </p>
              <p>
                <span className="text-muted-foreground">
                  Next scheduled sync:
                </span>{" "}
                {nextSync ? formatDateTime(nextSync) : "Not scheduled"}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => triggerSync.mutate()}
            disabled={isTriggering || isLoading}
            aria-busy={isTriggering}
            aria-label={
              isTriggering ? "Syncing tenders" : "Trigger tender sync now"
            }
          >
            {isTriggering ? "Syncing…" : "Trigger sync now"}
          </Button>
          {isTriggering && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => stopSync()}
              aria-label="Stop tender sync"
            >
              <Square className="w-3.5 h-3.5 mr-1" aria-hidden />
              Stop sync
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
