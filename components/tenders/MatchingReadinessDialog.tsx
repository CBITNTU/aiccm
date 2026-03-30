"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink } from "lucide-react";
import type { ReadinessResult } from "@/lib/matchingReadiness";

interface MatchingReadinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  readiness: ReadinessResult;
  onRunAnyway: () => void;
}

export function MatchingReadinessDialog({
  open,
  onOpenChange,
  companyId: _companyId,
  readiness,
  onRunAnyway,
}: MatchingReadinessDialogProps) {
  const router = useRouter();

  const requiredFields = readiness.fields.filter((f) => f.required);
  const recommendedFields = readiness.fields.filter((f) => !f.required);

  const hasMissingRequired = requiredFields.some((f) => f.status === "missing");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Company Profile Readiness</DialogTitle>
          <DialogDescription>
            {hasMissingRequired
              ? "Some required data is missing. Matching results may be incomplete or inaccurate."
              : "Your company profile has the basics covered. Filling in recommended fields will improve accuracy."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Pending changes warning */}
          {readiness.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  {readiness.warnings.map((warning, i) => (
                    <p key={i} className="text-sm text-amber-800 dark:text-amber-200">
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Required fields */}
          <div>
            <h4 className="text-sm font-medium mb-2">Required</h4>
            <div className="space-y-2">
              {requiredFields.map((field) => (
                <div key={field.name} className="flex items-start gap-2">
                  {field.status === "filled" ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                  ) : field.status === "partial" ? (
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{field.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended fields */}
          {recommendedFields.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Recommended</h4>
              <div className="space-y-2">
                {recommendedFields.map((field) => (
                  <div key={field.name} className="flex items-start gap-2">
                    {field.status === "filled" ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{field.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {field.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              router.push(`/my-company`);
            }}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Edit Company Profile
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onRunAnyway();
            }}
          >
            Run Anyway
          </Button>
        </DialogFooter>

        {hasMissingRequired && (
          <p className="text-xs text-muted-foreground text-center">
            Results may be less accurate with incomplete data
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
