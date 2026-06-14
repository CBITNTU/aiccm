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
  REVIEWABLE_SCALAR_FIELDS,
  getLocalizedCompanyFieldLabel,
  type PendingChanges,
} from "@/lib/companyFieldCategories";
import { queryKeys } from "@/lib/queryKeys";
import { formatPastProjectsValue } from "@/components/company/PastProjectsDisplay";
import type { PendingReviewRequest, ResolvedReviewRequest } from "@/hooks/useCompanyPageData";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("CompanyPage");
  const label = getLocalizedCompanyFieldLabel(field, t);
  const isPastProjects = field === "pastProjects";

  return (
    <div className="border border-blue-100 rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-blue-700 mb-1">{t("pendingChanges.current")}</div>
          <div className="text-sm text-foreground bg-blue-50 border border-blue-200 rounded p-2 min-h-[2rem]">
            {isPastProjects ? formatPastProjectsValue(current, t) : (current || <span className="text-muted-foreground italic">{t("pendingChanges.empty")}</span>)}
          </div>
        </div>
        <div>
          <div className="text-xs text-blue-700 mb-1">{t("pendingChanges.proposed")}</div>
          <div className="text-sm text-foreground bg-blue-100 border border-blue-300 rounded p-2 min-h-[2rem]">
            {isPastProjects ? formatPastProjectsValue(proposed, t) : (proposed || <span className="text-muted-foreground italic">{t("pendingChanges.empty")}</span>)}
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
  const t = useTranslations("CompanyPage");
  const label = getLocalizedCompanyFieldLabel(field, t);
  const getName = (id: string) => nameMap?.[id] ?? id;

  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {namesLoading && (
        <p className="text-xs text-muted-foreground">{t("pendingChanges.loading")}</p>
      )}
      {added.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-blue-800 mr-1">{t("pendingChanges.added")}</span>
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
          <span className="text-xs text-slate-600 mr-1">{t("pendingChanges.removed")}</span>
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
  const t = useTranslations("CompanyPage");
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

  // Pending-change diffs only need names for the handful of added/removed ids,
  // so resolve those targeted instead of fetching the entire reference list.
  const capPendingIds = useMemo(
    () =>
      pendingChanges.capabilities
        ? [...pendingChanges.capabilities.added, ...pendingChanges.capabilities.removed]
        : [],
    [pendingChanges.capabilities],
  );
  const marketPendingIds = useMemo(
    () =>
      pendingChanges.markets
        ? [...pendingChanges.markets.added, ...pendingChanges.markets.removed]
        : [],
    [pendingChanges.markets],
  );

  const needsCapLabels = capPendingIds.length > 0;
  const needsMarketLabels = marketPendingIds.length > 0;
  // Standards reference list is small, so the full list is fine here.
  const needsStandardLabels = !!pendingChanges.standards;

  const [capQuery, marketQuery, stdQuery] = useQueries({
    queries: [
      {
        queryKey: ["capabilityNames", [...capPendingIds].sort()],
        queryFn: async () => (await api.getCapabilityNames(capPendingIds)).capabilities,
        staleTime: 30 * 60 * 1000,
        enabled: needsCapLabels,
      },
      {
        queryKey: ["marketNames", [...marketPendingIds].sort()],
        queryFn: async () => (await api.getMarketNames(marketPendingIds)).markets,
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
      toast.success(t("pendingChangesBar.changesSubmittedSuccess"));
      onSuccess?.();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("pendingChangesBar.changesSubmittedError"),
      );
    }
  };

  const handleDiscard = async () => {
    try {
      await discardMutation.mutateAsync(companyId);
      toast.success(t("pendingChangesBar.changesDiscardedSuccess"));
      onSuccess?.();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("pendingChangesBar.changesDiscardedError"),
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
                ? t("pendingChangesBar.changesUnderReview")
                : isChangesRequested
                  ? t("pendingChangesBar.changesToAddress", { count: totalChanges })
                  : isRejected
                    ? t("pendingChangesBar.rejectedChanges", { count: totalChanges })
                    : t("pendingChangesBar.pendingChanges", { count: totalChanges })}
            </span>
            {!isSubmitted && (
              <Badge variant="outline" className={`text-xs shrink-0 ${
                isChangesRequested
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : isRejected
                    ? "bg-red-100 text-red-800 border-red-300"
                    : "bg-amber-100 text-amber-800 border-amber-300"
              }`}>
                {isChangesRequested ? t("pendingChanges.changesRequested") : isRejected ? t("pendingChangesBar.rejected") : t("sectionCard.draft")}
              </Badge>
            )}
            {isSubmitted && (
              <Badge
                variant="outline"
                className="text-xs bg-blue-50 border-blue-200 shrink-0"
              >
                {t("pendingChangesBar.awaitingReview")}
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
                      {t("pendingChangesBar.discard")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("pendingChangesBar.discardDialogTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("pendingChangesBar.discardDialogDesc")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("pendingChangesBar.discardCancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDiscard}>
                        {t("pendingChangesBar.discardConfirm")}
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
                  {hasResolvedFeedback ? t("pendingChangesBar.resubmitForReview") : t("pendingChangesBar.reviewAndSubmit")}
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
            <DialogTitle>{t("pendingChangesBar.submitDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("pendingChangesBar.submitDialogDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-900">
                {t("pendingChangesBar.submitDialogWarning")}
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
                {t("pendingChangesBar.notesLabel")}
              </label>
              <Textarea
                value={submitNotes}
                onChange={(e) => setSubmitNotes(e.target.value)}
                placeholder={t("pendingChangesBar.notesPlaceholder")}
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
              {t("pendingChangesBar.cancelButton")}
            </Button>
            <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              {t("pendingChangesBar.submitButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
