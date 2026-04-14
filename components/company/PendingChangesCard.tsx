"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { FileEdit, Send, Trash2, Lock, Loader2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useSubmitChangesForReview, useDiscardPendingChanges } from "@/hooks/useCompanyMutations";
import { api } from "@/lib/api/client";
import {
  REVIEWABLE_SCALAR_FIELDS,
  getLocalizedCompanyFieldLabel,
  type PendingChanges,
} from "@/lib/companyFieldCategories";
import { formatPastProjectsValue } from "@/components/company/PastProjectsDisplay";
import { queryKeys } from "@/lib/queryKeys";

const SCALAR_FIELD_ORDER = [
  "companyName",
  "description",
  "keyCapabilities",
  "certifications",
  "equipment",
  "pastProjects",
  "companiesHouseNumber",
] as const;

interface PendingChangesCardProps {
  companyId: string;
  pendingChanges: PendingChanges;
  pendingReviewRequest?: {
    id: string;
    status: string;
    reviewFeedback: Record<string, unknown> | null;
    reviewNotes: string | null;
    createdAt: string;
  } | null;
  // Resolved names for relation fields (passed from parent)
  capabilityNames?: Record<string, string>;
  marketNames?: Record<string, string>;
  standardNames?: Record<string, string>;
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

export function PendingChangesCard({
  companyId,
  pendingChanges,
  pendingReviewRequest,
  capabilityNames,
  marketNames,
  standardNames,
}: PendingChangesCardProps) {
  const t = useTranslations("CompanyPage");
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitNotes, setSubmitNotes] = useState("");

  const submitMutation = useSubmitChangesForReview();
  const discardMutation = useDiscardPendingChanges();

  const isSubmitted = !!pendingReviewRequest;
  const isSubmitting = submitMutation.isPending;
  const isDiscarding = discardMutation.isPending;

  // Count total changes
  const scalarCount = pendingChanges.scalarFields ? Object.keys(pendingChanges.scalarFields).length : 0;
  const capCount = (pendingChanges.capabilities?.added?.length ?? 0) + (pendingChanges.capabilities?.removed?.length ?? 0);
  const marketCount = (pendingChanges.markets?.added?.length ?? 0) + (pendingChanges.markets?.removed?.length ?? 0);
  const stdCount = (pendingChanges.standards?.added?.length ?? 0) + (pendingChanges.standards?.removed?.length ?? 0);
  const totalChanges = scalarCount + (capCount > 0 ? 1 : 0) + (marketCount > 0 ? 1 : 0) + (stdCount > 0 ? 1 : 0);

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync({
        companyId,
        notes: submitNotes.trim() || undefined,
      });
      setShowSubmitDialog(false);
      setSubmitNotes("");
      toast.success(t("pendingChangesBar.changesSubmittedSuccess"));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("pendingChangesBar.changesSubmittedError");
      toast.error(message);
    }
  };

  const handleDiscard = async () => {
    try {
      await discardMutation.mutateAsync(companyId);
      toast.success(t("pendingChangesBar.changesDiscardedSuccess"));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("pendingChangesBar.changesDiscardedError");
      toast.error(message);
    }
  };

  const needsCapLabels = !!pendingChanges.capabilities;
  const needsMarketLabels = !!pendingChanges.markets;
  const needsStandardLabels = !!pendingChanges.standards;

  const [capQuery, marketQuery, stdQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.referenceCapabilities(),
        queryFn: async () => (await api.getCapabilities()).capabilities,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        enabled: needsCapLabels,
      },
      {
        queryKey: queryKeys.referenceMarkets(),
        queryFn: async () => (await api.getMarkets()).markets,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        enabled: needsMarketLabels,
      },
      {
        queryKey: queryKeys.referenceStandards(),
        queryFn: async () => (await api.getStandards()).standards,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        enabled: needsStandardLabels,
      },
    ],
  });

  const mergedCapabilityNames = useMemo(() => {
    const fromApi =
      capQuery.data?.reduce<Record<string, string>>((acc, c) => {
        acc[c.id] = c.name;
        return acc;
      }, {}) ?? {};
    return { ...fromApi, ...capabilityNames };
  }, [capQuery.data, capabilityNames]);

  const mergedMarketNames = useMemo(() => {
    const fromApi =
      marketQuery.data?.reduce<Record<string, string>>((acc, m) => {
        acc[m.id] = m.name;
        return acc;
      }, {}) ?? {};
    return { ...fromApi, ...marketNames };
  }, [marketQuery.data, marketNames]);

  const mergedStandardNames = useMemo(() => {
    const fromApi =
      stdQuery.data?.reduce<Record<string, string>>((acc, s) => {
        acc[s.id] = s.name;
        return acc;
      }, {}) ?? {};
    return { ...fromApi, ...standardNames };
  }, [stdQuery.data, standardNames]);

  const orphanScalarFields = useMemo(() => {
    if (!pendingChanges.scalarFields) return [];
    const ordered = new Set<string>(SCALAR_FIELD_ORDER);
    return (REVIEWABLE_SCALAR_FIELDS as readonly string[]).filter(
      (k) =>
        pendingChanges.scalarFields![k] != null && !ordered.has(k),
    );
  }, [pendingChanges.scalarFields]);

  return (
    <>
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {isSubmitted ? (
                <>
                  <Lock className="h-4 w-4 text-blue-600" />
                  {t("pendingChangesCard.titleUnderReview")}
                </>
              ) : (
                <>
                  <FileEdit className="h-4 w-4 text-blue-600" />
                  {t("pendingChangesCard.titleDraft")}
                </>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isSubmitted ? (
                <Badge variant="outline" className="text-xs bg-blue-100 border-blue-200">
                  <Clock className="h-3 w-3 mr-1" />
                  {t("pendingChangesBar.awaitingReview")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  {t("pendingChangesCard.badgeDraft", { count: totalChanges })}
                </Badge>
              )}
            </div>
          </div>
          {isSubmitted && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("pendingChangesCard.submittedDescription")}
            </p>
          )}
          {!isSubmitted && (
            <p className="text-sm text-muted-foreground mt-1">
              {t("pendingChangesCard.draftDescription")}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Scalar field diffs */}
          {pendingChanges.scalarFields && SCALAR_FIELD_ORDER.map((field) => {
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
              nameMap={mergedCapabilityNames}
              namesLoading={needsCapLabels && capQuery.isPending}
            />
          )}
          {pendingChanges.markets && (
            <RelationFieldDiff
              field="markets"
              added={pendingChanges.markets.added}
              removed={pendingChanges.markets.removed}
              nameMap={mergedMarketNames}
              namesLoading={needsMarketLabels && marketQuery.isPending}
            />
          )}
          {pendingChanges.standards && (
            <RelationFieldDiff
              field="standards"
              added={pendingChanges.standards.added}
              removed={pendingChanges.standards.removed}
              nameMap={mergedStandardNames}
              namesLoading={needsStandardLabels && stdQuery.isPending}
            />
          )}

          {pendingChanges.lastSavedAt && (
            <p className="text-xs text-muted-foreground">
              {t("pendingChangesCard.lastSaved")}{" "}
              {new Date(pendingChanges.lastSavedAt).toLocaleString()}
            </p>
          )}
        </CardContent>

        {!isSubmitted && (
          <CardFooter className="flex gap-2 pt-0">
            <Button
              onClick={() => setShowSubmitDialog(true)}
              disabled={isSubmitting || isDiscarding}
              size="sm"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              {t("pendingChangesBar.submitButton")}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || isDiscarding}
                >
                  {isDiscarding ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  {t("pendingChangesCard.discardDraft")}
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
          </CardFooter>
        )}
      </Card>

      {/* Submit Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pendingChangesBar.submitDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("pendingChangesCard.submitDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-900">
                {t("pendingChangesBar.submitDialogWarning")}
              </p>
            </div>

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
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              {t("pendingChangesBar.cancelButton")}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("pendingChangesBar.submitButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
