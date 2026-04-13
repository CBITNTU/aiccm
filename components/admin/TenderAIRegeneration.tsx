"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useBatchProgress } from "@/hooks/useBatchProgress";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "tender_ai_regeneration_batch_id";

export function TenderAIRegeneration() {
  const t = useTranslations("AdminTenderAIRegen");
  const [isOpen, setIsOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const { batch, progress, isLoading } = useBatchProgress(batchId, !!batchId); // Poll even when dialog is closed

  // Load batch ID from localStorage on mount
  useEffect(() => {
    const storedBatchId = localStorage.getItem(STORAGE_KEY);
    if (storedBatchId) {
      setBatchId(storedBatchId);
    }
  }, []);

  // Save batch ID to localStorage when it changes
  useEffect(() => {
    if (batchId) {
      localStorage.setItem(STORAGE_KEY, batchId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [batchId]);

  // Clear batch ID when batch is complete
  useEffect(() => {
    if (batch && (batch.status === "completed" || batch.status === "failed")) {
      // Keep it for a bit so user can see completion, then clear after 10 seconds
      const timer = setTimeout(() => {
        setBatchId(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [batch]);

  const triggerWorker = async () => {
    try {
      console.log("🚀 Manually triggering queue worker...");
      const response = await fetch("/api/queue/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 10, continuous: true }),
      });

      const data = await response.json();
      console.log("✅ Worker triggered:", data);

      if (!response.ok) {
        console.error("❌ Worker error:", data);
        toast.error(t("toasts.workerError"));
      } else {
        console.log(`✅ Worker processing: ${data.processed} jobs processed`);
      }
    } catch (error) {
      console.error("❌ Failed to trigger worker:", error);
      toast.error(t("toasts.workerRetryError"));
    }
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      const response = await fetch("/api/admin/regenerate-tender-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t("toasts.startError"));
      }

      setBatchId(data.batchId);
      toast.success(
        t("toasts.queued", { jobCount: data.jobCount, tenderCount: data.tenderCount }),
      );

      // Manually trigger the worker to start processing
      triggerWorker();
    } catch (error) {
      console.error("Error regenerating tender AI:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.startError"),
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const isComplete =
    batch?.status === "completed" || batch?.status === "failed";
  const isProcessing = batch && !isComplete;

  return (
    <div className="space-y-4">
      {/* Status Badge - Show when processing in background */}
      {isProcessing && !isOpen && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {t("inProgressTitle")}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {t("inProgressSubtitle", {
                completed: batch.completedJobs,
                total: batch.totalJobs,
                progress,
              })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="text-blue-600 hover:text-blue-700"
          >
            {t("viewDetails")}
          </Button>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={isRegenerating}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("openButton")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!batchId ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("startDescription")}</p>
                <Button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="w-full"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("queuing")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t("startButton")}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t("progressLabel")}</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium">
                        {batch?.completedJobs || 0}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{t("completed")}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        batch?.status === "failed" ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <span className="font-medium">
                        {batch
                          ? batch.totalJobs -
                            batch.completedJobs -
                            batch.failedJobs
                          : 0}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{t("remaining")}</p>
                  </div>
                </div>

                {batch && (
                  <div className="text-sm">
                    <p>
                      <span className="font-medium">{t("totalLabel")}</span>{" "}
                      {t("totalValue", { count: batch.totalJobs })}
                    </p>
                    <p>
                      <span className="font-medium">{t("failedLabel")}</span>{" "}
                      {batch.failedJobs}
                    </p>
                  </div>
                )}

                {!isComplete && progress === 0 && (
                  <Button
                    onClick={triggerWorker}
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("startProcessingButton")}
                  </Button>
                )}

                {isComplete && (
                  <div className="space-y-2">
                    <div
                      className={`p-3 rounded-lg ${batch.status === "completed" ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"}`}
                    >
                      <div className="flex items-center gap-2">
                        {batch.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <span
                          className={`font-medium ${batch.status === "completed" ? "text-green-900 dark:text-green-100" : "text-red-900 dark:text-red-100"}`}
                        >
                          {batch.status === "completed"
                            ? t("completedMessage")
                            : t("failedMessage")}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setBatchId(null);
                        setIsOpen(false);
                      }}
                      className="w-full"
                    >
                      {t("closeButton")}
                    </Button>
                  </div>
                )}

                {!isComplete && (
                  <p className="text-xs text-muted-foreground text-center">{t("backgroundHint")}</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
