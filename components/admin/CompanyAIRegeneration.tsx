"use client";

import { useState, useEffect } from "react";
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
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "company_ai_regeneration_batch_id";

export function CompanyAIRegeneration() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const { batch, progress, isLoading: _isLoading } = useBatchProgress(batchId, !!batchId);

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
        toast.error(
          "Failed to start worker. Jobs are queued but not processing.",
        );
      } else {
        console.log(`✅ Worker processing: ${data.processed} jobs processed`);
      }
    } catch (error) {
      console.error("❌ Failed to trigger worker:", error);
      toast.error("Failed to start worker. Please try again.");
    }
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      const response = await fetch("/api/admin/regenerate-company-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to start regeneration");
      }

      setBatchId(data.batchId);
      toast.success(
        `Queued ${data.jobCount} AI processing jobs for ${data.companyCount} companies`,
      );

      // Manually trigger the worker to start processing
      triggerWorker();
    } catch (error) {
      console.error("Error regenerating company AI:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start regeneration",
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
              Company AI Regeneration in Progress
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {batch.completedJobs}/{batch.totalJobs} completed ({progress}%)
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="text-blue-600 hover:text-blue-700"
          >
            View Details
          </Button>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={isRegenerating}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate All Company AI
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Regenerate Company AI Summaries & Taxonomies
            </DialogTitle>
            <DialogDescription>
              This will regenerate AI summaries and capability taxonomies for
              all companies. This will dynamically create new capabilities based
              on company data. This process may take several minutes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!batch && !isRegenerating && (
              <Button onClick={handleRegenerate} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Start Regeneration
              </Button>
            )}

            {isRegenerating && !batch && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {batch && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium">{batch.totalJobs}</div>
                    <p className="text-muted-foreground">Total Jobs</p>
                  </div>
                  <div>
                    <div className="font-medium text-green-600">
                      {batch.completedJobs}
                    </div>
                    <p className="text-muted-foreground">Completed</p>
                  </div>
                  <div>
                    <div className="font-medium text-red-600">
                      {batch.failedJobs}
                    </div>
                    <p className="text-muted-foreground">Failed</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isComplete ? (
                    batch.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  <span className="text-sm font-medium">
                    {batch.status === "completed"
                      ? "Regeneration Complete"
                      : batch.status === "failed"
                        ? "Regeneration Failed"
                        : "Processing..."}
                  </span>
                </div>

                {!isComplete && progress === 0 && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                          Jobs Queued
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                          Jobs are queued but not processing. Click the button
                          below to start processing.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={triggerWorker}
                          className="mt-2"
                        >
                          <RefreshCw className="mr-2 h-3 w-3" />
                          Start Processing Jobs
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {batch.status === "failed" && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-900 dark:text-red-100">
                      Some jobs failed. Check the logs for details.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
