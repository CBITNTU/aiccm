"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScalarFieldDiff } from "@/components/company/PendingChangesBar";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
import { useCompanyCapabilities } from "@/hooks/useCompanyTaxonomy";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  getLocalizedCompanyFieldLabel,
  type PendingChanges,
} from "@/lib/companyFieldCategories";

// Order the reviewable scalar fields the AI can propose, matching the diff
// ordering used by the human-edit PendingChangesBar.
const AI_FIELD_ORDER = [
  "description",
  "keyCapabilities",
  "certifications",
  "equipment",
  "pastProjects",
] as const;

// Reviewable relations the AI can propose additions to. Rendered after the
// scalar rows. `standards` is deliberately absent — nothing suggests those yet.
const AI_RELATION_ORDER = ["capabilities", "markets"] as const;
type AIRelation = (typeof AI_RELATION_ORDER)[number];

interface AIProposedChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName?: string;
  proposals: PendingChanges | null;
  /** id -> display name for the competency/market ids inside `proposals`. */
  relationNames?: Record<string, string>;
  isVerified: boolean;
  onApplied: () => void | Promise<void>;
}

export function AIProposedChangesModal({
  open,
  onOpenChange,
  companyId,
  companyName,
  proposals,
  relationNames = {},
  isVerified,
  onApplied,
}: AIProposedChangesModalProps) {
  const t = useTranslations("CompanyPage");
  const queryClient = useQueryClient();
  const updateCompanyMutation = useUpdateCompany();
  const capabilitiesQuery = useCompanyCapabilities(companyId);
  const competencyLimit = capabilitiesQuery.data?.competencyLimit ?? null;
  const [isApplying, setIsApplying] = useState(false);

  const proposedFields = useMemo(
    () =>
      proposals?.scalarFields
        ? AI_FIELD_ORDER.filter((f) => proposals.scalarFields![f] != null)
        : [],
    [proposals],
  );

  const proposedRelations = useMemo(
    () =>
      AI_RELATION_ORDER.filter(
        (r) => (proposals?.[r]?.added.length ?? 0) > 0,
      ),
    [proposals],
  );

  const allKeys = useMemo<string[]>(
    () => [...proposedFields, ...proposedRelations],
    [proposedFields, proposedRelations],
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [initializedFor, setInitializedFor] = useState<PendingChanges | null>(null);

  // Default every proposed field to checked whenever a fresh proposal opens.
  // Each analysis produces a new `proposals` object, so identity drives the reset
  // (adjusting state during render — React's recommended pattern over an effect).
  if (open && proposals && initializedFor !== proposals) {
    setInitializedFor(proposals);
    setSelected(Object.fromEntries(allKeys.map((k) => [k, true])));
  }

  if (!proposals || allKeys.length === 0) return null;

  const selectedCount = allKeys.filter((k) => selected[k]).length;
  const allSelected = selectedCount === allKeys.length;

  const toggleField = (field: string) =>
    setSelected((prev) => ({ ...prev, [field]: !prev[field] }));

  const toggleAll = () => {
    const next = !allSelected;
    setSelected(Object.fromEntries(allKeys.map((k) => [k, next])));
  };

  const handleReject = () => {
    onOpenChange(false);
  };

  const handleAccept = async () => {
    const updates: Record<string, unknown> = {};
    for (const field of proposedFields) {
      if (selected[field]) {
        updates[field] = proposals.scalarFields![field].proposed ?? "";
      }
    }
    const acceptedRelations = proposedRelations.filter((r) => selected[r]);

    if (Object.keys(updates).length === 0 && acceptedRelations.length === 0) {
      onOpenChange(false);
      return;
    }

    setIsApplying(true);
    try {
      if (Object.keys(updates).length > 0) {
        await updateCompanyMutation.mutateAsync({ companyId, updates });
      }

      for (const relation of acceptedRelations) {
        const change = proposals[relation]!;
        // Merge rather than replace, and always keep every current selection —
        // only the AI additions are trimmed to fit the competency limit. If
        // there is no room left the payload equals the current set and the
        // route short-circuits as a no-op.
        let merged = Array.from(new Set(change.proposed));
        if (relation === "capabilities" && competencyLimit != null) {
          const room = competencyLimit - change.current.length;
          merged =
            room > 0
              ? [...change.current, ...change.added.slice(0, room)]
              : [...change.current];
        }
        if (relation === "capabilities") {
          await api.syncCapabilities(companyId, merged);
          queryClient.invalidateQueries({
            queryKey: queryKeys.companyCapabilities(companyId),
          });
        } else {
          await api.syncMarkets(companyId, merged);
          queryClient.invalidateQueries({
            queryKey: queryKeys.companyMarkets(companyId),
          });
        }
      }

      await onApplied();
      onOpenChange(false);
      toast.success(
        isVerified
          ? t("aiProposedChanges.acceptedForReviewToast")
          : t("aiProposedChanges.acceptedToast"),
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("aiProposedChanges.acceptError"),
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("aiProposedChanges.title")}
          </DialogTitle>
          <DialogDescription>
            {isVerified
              ? t("aiProposedChanges.descriptionVerified")
              : t("aiProposedChanges.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t("aiProposedChanges.selectedCount", {
                count: selectedCount,
                total: proposedFields.length,
              })}
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm text-primary hover:underline"
            >
              {allSelected
                ? t("aiProposedChanges.deselectAll")
                : t("aiProposedChanges.selectAll")}
            </button>
          </div>

          {proposedFields.map((field) => {
            const change = proposals.scalarFields![field];
            return (
              <div key={field} className="flex gap-3">
                <Checkbox
                  id={`ai-field-${field}`}
                  checked={!!selected[field]}
                  onCheckedChange={() => toggleField(field)}
                  className="mt-4"
                  aria-label={getLocalizedCompanyFieldLabel(field, t)}
                />
                <div className="flex-1 min-w-0">
                  <ScalarFieldDiff
                    field={field}
                    current={change.current}
                    proposed={change.proposed}
                    companyName={companyName}
                  />
                </div>
              </div>
            );
          })}

          {proposedRelations.map((relation: AIRelation) => {
            const change = proposals[relation]!;
            const overLimit =
              relation === "capabilities" &&
              competencyLimit != null &&
              change.proposed.length > competencyLimit;
            return (
              <div key={relation} className="flex gap-3">
                <Checkbox
                  id={`ai-relation-${relation}`}
                  checked={!!selected[relation]}
                  onCheckedChange={() => toggleField(relation)}
                  className="mt-4"
                  aria-label={getLocalizedCompanyFieldLabel(relation, t)}
                />
                <div className="flex-1 min-w-0 rounded-md border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {getLocalizedCompanyFieldLabel(relation, t)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {change.added.map((id) => (
                      <Badge key={id} variant="secondary" className="text-xs">
                        + {relationNames[id] ?? id}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("aiProposedChanges.relationHint")}
                  </p>
                  {overLimit && (
                    <p className="text-xs text-amber-600 mt-1">
                      {t("aiProposedChanges.relationLimitHint", {
                        limit: competencyLimit!,
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReject} disabled={isApplying}>
            {t("aiProposedChanges.reject")}
          </Button>
          <Button onClick={handleAccept} disabled={selectedCount === 0 || isApplying}>
            {isApplying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t("aiProposedChanges.accept", { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
