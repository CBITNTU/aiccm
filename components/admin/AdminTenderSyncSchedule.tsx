"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAdminTenderSync } from "@/components/admin/AdminTenderSyncContext";

function formatDateTimeGMT(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${d.toLocaleString("en-GB", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    })} GMT`;
  } catch {
    return iso;
  }
}

export function AdminTenderSyncSchedule() {
  const t = useTranslations("AdminTenderSync");
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
          toast.success(t("toasts.completed"));
        } else {
          toast.warning(t("toasts.failed"));
        }
      } else {
        toast.success(data.message ?? t("toasts.notRun"));
      }
    },
    onError: (err: Error) => {
      const isAborted =
        err.name === "AbortError" ||
        (err instanceof Error && err.message?.includes("abort"));
      if (isAborted) {
        toast.info(t("toasts.stopped"));
      } else {
        toast.error(err.message ?? t("toasts.triggerError"));
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
          {t("cardTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="text-sm grid gap-1"
          aria-live="polite"
          aria-busy={isBusy}
          aria-label={t("ariaStatus")}
        >
          {isLoading ? (
            <p className="text-muted-foreground">{t("loading")}</p>
          ) : isError ? (
            <p className="text-destructive">
              {error instanceof Error ? error.message : t("loadError")}
            </p>
          ) : (
            <>
              <p>
                <span className="text-muted-foreground">{t("lastSyncLabel")}</span>{" "}
                {lastSync ? formatDateTimeGMT(lastSync) : t("never")}
              </p>
              <p>
                <span className="text-muted-foreground">{t("nextSyncLabel")}</span>{" "}
                {nextSync ? formatDateTimeGMT(nextSync) : t("notScheduled")}
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
            aria-label={isTriggering ? t("ariaTriggering") : t("ariaTrigger")}
          >
            {isTriggering ? t("syncingButton") : t("triggerButton")}
          </Button>
          {isTriggering && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => stopSync()}
              aria-label={t("ariaStop")}
            >
              <Square className="w-3.5 h-3.5 mr-1" aria-hidden />
              {t("stopButton")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
