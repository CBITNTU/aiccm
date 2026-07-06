"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScalarFieldDiff } from "@/components/company/PendingChangesBar";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
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

interface AIProposedChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  proposals: PendingChanges | null;
  isVerified: boolean;
  onApplied: () => void | Promise<void>;
}

export function AIProposedChangesModal({
  open,
  onOpenChange,
  companyId,
  proposals,
  isVerified,
  onApplied,
}: AIProposedChangesModalProps) {
  const t = useTranslations("CompanyPage");
  const updateCompanyMutation = useUpdateCompany();

  const proposedFields = useMemo(
    () =>
      proposals?.scalarFields
        ? AI_FIELD_ORDER.filter((f) => proposals.scalarFields![f] != null)
        : [],
    [proposals],
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [initializedFor, setInitializedFor] = useState<PendingChanges | null>(null);

  // Default every proposed field to checked whenever a fresh proposal opens.
  // Each analysis produces a new `proposals` object, so identity drives the reset
  // (adjusting state during render — React's recommended pattern over an effect).
  if (open && proposals && initializedFor !== proposals) {
    setInitializedFor(proposals);
    setSelected(Object.fromEntries(proposedFields.map((f) => [f, true])));
  }

  if (!proposals || proposedFields.length === 0) return null;

  const selectedCount = proposedFields.filter((f) => selected[f]).length;
  const allSelected = selectedCount === proposedFields.length;

  const toggleField = (field: string) =>
    setSelected((prev) => ({ ...prev, [field]: !prev[field] }));

  const toggleAll = () => {
    const next = !allSelected;
    setSelected(Object.fromEntries(proposedFields.map((f) => [f, next])));
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
    if (Object.keys(updates).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await updateCompanyMutation.mutateAsync({
        companyId,
        updates,
      });
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
                  />
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReject}>
            {t("aiProposedChanges.reject")}
          </Button>
          <Button
            onClick={handleAccept}
            disabled={selectedCount === 0 || updateCompanyMutation.isPending}
          >
            {updateCompanyMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            )}
            {t("aiProposedChanges.accept", { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
