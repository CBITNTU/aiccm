"use client";

import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileEdit, Send, Trash2, Lock, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  useSubmitChangesForReview,
  useDiscardPendingChanges,
} from "@/hooks/useCompanyMutations";
import { api } from "@/lib/api/client";
import {
  FIELD_LABELS,
  REVIEWABLE_SCALAR_FIELDS,
  type PendingChanges,
} from "@/lib/companyFieldCategories";
import { queryKeys } from "@/lib/queryKeys";
import { formatPastProjectsValue } from "@/components/company/PastProjectsDisplay";
import type { PendingReviewRequest, ResolvedReviewRequest } from "@/hooks/useCompanyPageData";

const SCALAR_FIELD_ORDER = [
  "companyName",
  "description",
  "keyCapabilities",
  "certifications",
  "equipment",
  "pastProjects",
  "companiesHouseNumber",
] as const;

interface PendingChangesBarProps {
  companyId: string;
  pendingChanges: PendingChanges;
  pendingReviewRequest: PendingReviewRequest | null;
  latestResolvedRequest?: ResolvedReviewRequest | null;
  onSuccess?: () => void;
}

function ScalarFieldDiff({
  field,
  current,
  proposed,
}: {
  field: string;
  current: string | null;
  proposed: string | null;
}) {
  const label = FIELD_LABELS[field] ?? field;
  const isPastProjects = field === "pastProjects";

  return (
    <div className="border border-blue-100 rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-blue-700 mb-1">Current</div>
          <div className="text-sm text-foreground bg-blue-50 border border-blue-200 rounded p-2 min-h-[2rem]">
            {isPastProjects ? formatPastProjectsValue(current) : (current || <span className="text-muted-foreground italic">Empty</span>)}
          </div>
        </div>
        <div>
          <div className="text-xs text-blue-700 mb-1">Proposed</div>
          <div className="text-sm text-foreground bg-blue-100 border border-blue-300 rounded p-2 min-h-[2rem]">
            {isPastProjects ? formatPastProjectsValue(proposed) : (proposed || <span className="text-muted-foreground italic">Empty</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RelationFieldDiff({
  field,
  added,
  removed,
  nameMap,
  namesLoading,
}: {
  field: string;
  added: string[];
  removed: string[];
  nameMap?: Record<string, string>;
  namesLoading?: boolean;
}) {
  const label = FIELD_LABELS[field] ?? field;
  const getName = (id: string) => nameMap?.[id] ?? id;

  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {namesLoading && (
        <p className="text-xs text-muted-foreground">Loading labels...</p>
      )}
      {added.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-blue-800 mr-1">Added:</span>
          {added.map((id) => (
            <Badge
              key={id}
              variant="outline"
              className="text-xs bg-sky-50 border-sky-200 text-sky-900"
            >
              + {getName(id)}
            </Badge>
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-slate-600 mr-1">Removed:</span>
          {removed.map((id) => (
            <Badge
              key={id}
              variant="outline"
              className="text-xs bg-slate-50 border border-dashed border-slate-200 text-slate-700"
            >
              - {getName(id)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function PendingChangesBar({
  companyId,
  pendingChanges,
  pendingReviewRequest,
  latestResolvedRequest,
  onSuccess,
}: PendingChangesBarProps) {
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitNotes, setSubmitNotes] = useState("");

  const submitMutation = useSubmitChangesForReview();
  const discardMutation = useDiscardPendingChanges();

  const isSubmitted = !!pendingReviewRequest;
  const reviewStatus = latestResolvedRequest?.status; // "changes_requested" | "rejected" | undefined
  const isChangesRequested = reviewStatus === "changes_requested";
  const isRejected = reviewStatus === "rejected";
  const hasResolvedFeedback = isChangesRequested || isRejected;

  // Count changes
  const scalarCount = pendingChanges.scalarFields
    ? Object.keys(pendingChanges.scalarFields).length
    : 0;
  const capCount =
    (pendingChanges.capabilities?.added?.length ?? 0) +
    (pendingChanges.capabilities?.removed?.length ?? 0);
  const marketCount =
    (pendingChanges.markets?.added?.length ?? 0) +
    (pendingChanges.markets?.removed?.length ?? 0);
  const stdCount =
    (pendingChanges.standards?.added?.length ?? 0) +
    (pendingChanges.standards?.removed?.length ?? 0);
  const totalChanges =
    scalarCount +
    (capCount > 0 ? 1 : 0) +
    (marketCount > 0 ? 1 : 0) +
    (stdCount > 0 ? 1 : 0);

  // Fetch reference names for relation diffs
  const needsCapLabels = !!pendingChanges.capabilities;
  const needsMarketLabels = !!pendingChanges.markets;
  const needsStandardLabels = !!pendingChanges.standards;

  const [capQuery, marketQuery, stdQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.referenceCapabilities(),
        queryFn: async () => (await api.getCapabilities()).capabilities,
        staleTime: 30 * 60 * 1000,
        enabled: needsCapLabels,
      },
      {
        queryKey: queryKeys.referenceMarkets(),
        queryFn: async () => (await api.getMarkets()).markets,
        staleTime: 30 * 60 * 1000,
        enabled: needsMarketLabels,
      },
      {
        queryKey: queryKeys.referenceStandards(),
        queryFn: async () => (await api.getStandards()).standards,
        staleTime: 30 * 60 * 1000,
        enabled: needsStandardLabels,
      },
    ],
  });

  const capNames = useMemo(
    () =>
      capQuery.data?.reduce<Record<string, string>>((acc, c) => {
        acc[c.id] = c.name;
        return acc;
      }, {}) ?? {},
    [capQuery.data],
  );

  const marketNames = useMemo(
    () =>
      marketQuery.data?.reduce<Record<string, string>>((acc, m) => {
        acc[m.id] = m.name;
        return acc;
      }, {}) ?? {},
    [marketQuery.data],
  );

  const standardNames = useMemo(
    () =>
      stdQuery.data?.reduce<Record<string, string>>((acc, s) => {
        acc[s.id] = s.name;
        return acc;
      }, {}) ?? {},
    [stdQuery.data],
  );

  const orphanScalarFields = useMemo(() => {
    if (!pendingChanges.scalarFields) return [];
    const ordered = new Set<string>(SCALAR_FIELD_ORDER);
    return (REVIEWABLE_SCALAR_FIELDS as readonly string[]).filter(
      (k) => pendingChanges.scalarFields![k] != null && !ordered.has(k),
    );
  }, [pendingChanges.scalarFields]);

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync({
        companyId,
        notes: submitNotes.trim() || undefined,
      });
      setShowSubmitDialog(false);
      setSubmitNotes("");
      toast.success("Changes submitted for review");
      onSuccess?.();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit changes",
      );
    }
  };

  const handleDiscard = async () => {
    try {
      await discardMutation.mutateAsync(companyId);
      toast.success("Draft changes discarded");
      onSuccess?.();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to discard changes",
      );
    }
  };

  return (
    <>
      {/* Floating bottom bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] ${
        isSubmitted
          ? "border-t-2 border-t-blue-500 bg-blue-50/95"
          : isRejected
            ? "border-t-2 border-t-red-500 bg-red-50/95"
            : isChangesRequested
              ? "border-t-2 border-t-amber-500 bg-amber-50/95"
              : "border-t-2 border-t-amber-500 bg-amber-50/95"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {isSubmitted ? (
              <Lock className="h-4 w-4 text-blue-600 shrink-0" />
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRejected ? "bg-red-400" : "bg-amber-400"} opacity-75`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRejected ? "bg-red-500" : "bg-amber-500"}`} />
                </span>
                <FileEdit className={`h-4 w-4 ${isRejected ? "text-red-600" : "text-amber-600"} shrink-0`} />
              </>
            )}
            <span className="text-sm font-medium truncate">
              {isSubmitted
                ? "Changes under review"
                : isChangesRequested
                  ? `${totalChanges} ${totalChanges === 1 ? "change" : "changes"} to address`
                  : isRejected
                    ? `${totalChanges} rejected ${totalChanges === 1 ? "change" : "changes"}`
                    : `${totalChanges} pending ${totalChanges === 1 ? "change" : "changes"}`}
            </span>
            {!isSubmitted && (
              <Badge variant="outline" className={`text-xs shrink-0 ${
                isChangesRequested
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : isRejected
                    ? "bg-red-100 text-red-800 border-red-300"
                    : "bg-amber-100 text-amber-800 border-amber-300"
              }`}>
                {isChangesRequested ? "Changes Requested" : isRejected ? "Rejected" : "Draft"}
              </Badge>
            )}
            {isSubmitted && (
              <Badge
                variant="outline"
                className="text-xs bg-blue-50 border-blue-200 shrink-0"
              >
                Awaiting Review
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isSubmitted && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={discardMutation.isPending}
                    >
                      {discardMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      Discard
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Discard all pending changes?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all draft changes. Your company profile will
                        remain as it currently appears. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDiscard}>
                        Discard Changes
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button
                  size="sm"
                  onClick={() => setShowSubmitDialog(true)}
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1" />
                  )}
                  {hasResolvedFeedback ? "Resubmit for Review" : "Review & Submit"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Submit dialog with full diff */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit Changes for Review</DialogTitle>
            <DialogDescription>
              Review your changes below. Once submitted, editing will be locked
              until the admin review is complete.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-900">
                While your changes are under review, you won&apos;t be able to
                edit these fields until the review is complete.
              </p>
            </div>

            {/* Scalar diffs */}
            {pendingChanges.scalarFields &&
              SCALAR_FIELD_ORDER.map((field) => {
                const change = pendingChanges.scalarFields?.[field];
                if (!change) return null;
                return (
                  <ScalarFieldDiff
                    key={field}
                    field={field}
                    current={change.current}
                    proposed={change.proposed}
                  />
                );
              })}
            {pendingChanges.scalarFields &&
              orphanScalarFields.map((field) => {
                const change = pendingChanges.scalarFields![field];
                if (!change) return null;
                return (
                  <ScalarFieldDiff
                    key={field}
                    field={field}
                    current={change.current}
                    proposed={change.proposed}
                  />
                );
              })}

            {/* Relation diffs */}
            {pendingChanges.capabilities && (
              <RelationFieldDiff
                field="capabilities"
                added={pendingChanges.capabilities.added}
                removed={pendingChanges.capabilities.removed}
                nameMap={capNames}
                namesLoading={needsCapLabels && capQuery.isPending}
              />
            )}
            {pendingChanges.markets && (
              <RelationFieldDiff
                field="markets"
                added={pendingChanges.markets.added}
                removed={pendingChanges.markets.removed}
                nameMap={marketNames}
                namesLoading={needsMarketLabels && marketQuery.isPending}
              />
            )}
            {pendingChanges.standards && (
              <RelationFieldDiff
                field="standards"
                added={pendingChanges.standards.added}
                removed={pendingChanges.standards.removed}
                nameMap={standardNames}
                namesLoading={needsStandardLabels && stdQuery.isPending}
              />
            )}

            <div>
              <label className="text-sm font-medium">
                Notes for reviewer (optional)
              </label>
              <Textarea
                value={submitNotes}
                onChange={(e) => setSubmitNotes(e.target.value)}
                placeholder="Explain what changed and why..."
                className="mt-1"
                maxLength={2000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSubmitDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
