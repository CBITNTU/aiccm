"use client";

import { useMatchingProgress } from "@/hooks/useMatchingProgress";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface MatchingProgressProps {
  companyId: string | null;
  onComplete?: () => void;
}

export function MatchingProgress({ companyId, onComplete }: MatchingProgressProps) {
  const { status, isLoading, error } = useMatchingProgress(companyId, true);
  const router = useRouter();

  if (!companyId) {
    return null;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Initializing...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isComplete = status.pending === 0 && status.processing === 0;
  const progress = status.total > 0 
    ? Math.round((status.completed / status.total) * 100)
    : 0;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" />
          )}
          {isComplete ? "Matching Complete" : "Analyzing Tenders"}
        </CardTitle>
        <CardDescription>
          {isComplete
            ? `Successfully analyzed ${status.completed} of ${status.total} tenders`
            : `Processing ${status.processing} of ${status.total} tenders...`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="font-medium">{status.completed}</span>
            </div>
            <p className="text-muted-foreground">Completed</p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="font-medium">{status.processing + status.pending}</span>
            </div>
            <p className="text-muted-foreground">In Progress</p>
          </div>
        </div>

        {status.estimatedSeconds > 0 && !isComplete && (
          <p className="text-xs text-muted-foreground">
            Estimated time remaining: {formatTime(status.estimatedSeconds)}
          </p>
        )}

        {status.results.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Top Matches:</p>
            <div className="space-y-1">
              {status.results
                .slice(0, 5)
                .sort((a, b) => (b.score.overallScore || 0) - (a.score.overallScore || 0))
                .map((result) => (
                  <div
                    key={result.tenderId}
                    className="flex items-center justify-between text-xs p-2 bg-muted rounded"
                  >
                    <span>Tender {result.tenderId.slice(0, 8)}...</span>
                    <span className="font-medium">
                      {result.score.overallScore || 0}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {isComplete && (
          <Button
            onClick={() => {
              if (onComplete) {
                onComplete();
              } else {
                router.push("/tenders");
              }
            }}
            className="w-full"
          >
            View Results
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
