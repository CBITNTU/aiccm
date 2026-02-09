"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, Play } from "lucide-react";
import { toast } from "sonner";
import { MatchingProgress } from "./MatchingProgress";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function MatchingTrigger() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isStartingWorker, setIsStartingWorker] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);

  const handleTrigger = async () => {
    if (!user) {
      toast.error("Please log in to find matching tenders");
      return;
    }

    try {
      setIsTriggering(true);

      // Get user's company
      const supabase = createClient();
      const { data: companies, error } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (error || !companies || companies.length === 0) {
        throw new Error("No company found for user");
      }

      const userCompanyId = (companies[0] as { id: string }).id;
      setCompanyId(userCompanyId);

      // Trigger matching (queue jobs)
      const response = await fetch("/api/match-tenders/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to trigger matching");
      }

      setJobCount(data.jobCount);
      setIsOpen(true);
      toast.success(
        `Queued ${data.jobCount} matching jobs. Click "Start Processing" to begin.`,
      );
    } catch (error) {
      console.error("Error triggering matching:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to trigger matching",
      );
      setIsOpen(false);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleStartWorker = async () => {
    try {
      setIsStartingWorker(true);

      const response = await fetch("/api/queue/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 10, continuous: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to start worker");
      }

      toast.success("Processing started");
    } catch (error) {
      console.error("Error starting worker:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start processing",
      );
    } finally {
      setIsStartingWorker(false);
    }
  };

  return (
    <>
      <Button onClick={handleTrigger} disabled={isTriggering}>
        {isTriggering ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            Find Matching Tenders
          </>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Finding Matching Tenders</DialogTitle>
            <DialogDescription>
              We&apos;re analyzing all available tenders to find the best
              matches for your company.
            </DialogDescription>
          </DialogHeader>

          {jobCount !== null && jobCount > 0 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>{jobCount} matching jobs</strong> have been queued.
                  Click the button below to start processing.
                </p>
              </div>

              <Button
                onClick={handleStartWorker}
                disabled={isStartingWorker}
                className="w-full"
              >
                {isStartingWorker ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Processing Jobs
                  </>
                )}
              </Button>
            </div>
          )}

          {companyId && (
            <MatchingProgress
              companyId={companyId}
              onComplete={() => {
                setIsOpen(false);
                setCompanyId(null);
                setJobCount(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
