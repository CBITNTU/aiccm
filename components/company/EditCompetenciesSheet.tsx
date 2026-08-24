"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import { EditSheetSkeleton } from "@/components/company/EditSheetSkeleton";
import { CapabilityTreeSelector } from "@/components/tenders/CapabilityTreeSelector";
import { api } from "@/lib/api/client";
import { useCompanyCapabilities } from "@/hooks/useCompanyTaxonomy";
import type { PendingChangesRelationField } from "@/lib/companyFieldCategories";

interface EditCompetenciesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  isVerified: boolean;
  isEditLocked: boolean;
  competencyLimit: number | null;
  pendingRelation?: PendingChangesRelationField;
  onSaved: () => void;
}

export function EditCompetenciesSheet({
  open,
  onOpenChange,
  companyId,
  isVerified,
  isEditLocked,
  competencyLimit,
  pendingRelation,
  onSaved,
}: EditCompetenciesSheetProps) {
  const t = useTranslations("CompanyPage");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [treeReady, setTreeReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Company's current capabilities come from the shared cache the tab already
  // populated, so opening the sheet triggers no extra request (only enabled while open).
  const companyCapsQuery = useCompanyCapabilities(open ? companyId : undefined);
  const loading = open && companyCapsQuery.isPending;

  const draftAddedSet = useMemo(
    () => new Set(pendingRelation?.added ?? []),
    [pendingRelation],
  );

  const handleTreeReady = useCallback(() => setTreeReady(true), []);

  useEffect(() => {
    if (!open) {
      setTreeReady(false);
      return;
    }
    if (companyCapsQuery.isError) {
      toast.error(t("editCompetenciesSheet.failedToLoad"));
      return;
    }
    const data = companyCapsQuery.data;
    if (!data) return;
    const approvedIds = data.capabilities.map((c) => c.id);
    const effectiveIds = pendingRelation ? pendingRelation.proposed : approvedIds;
    setSelectedIds(effectiveIds);
    setInitialIds(effectiveIds);
    setNameMap(Object.fromEntries(data.capabilities.map((c) => [c.id, c.name])));
  }, [open, companyCapsQuery.data, companyCapsQuery.isError, pendingRelation, t]);

  // Once the tree has loaded the full reference name map, drop any selected ids
  // that no longer resolve to a capability (orphans left by an admin reset).
  // This keeps the "Selected" badges from rendering raw UUIDs and stops the
  // orphans from being re-persisted on save. Filtering initialIds too means a
  // freshly-opened sheet on already-orphaned data shows no spurious changes.
  useEffect(() => {
    if (!treeReady) return;
    setSelectedIds((prev) => {
      const next = prev.filter((id) => id in nameMap);
      return next.length === prev.length ? prev : next;
    });
    setInitialIds((prev) => {
      const next = prev.filter((id) => id in nameMap);
      return next.length === prev.length ? prev : next;
    });
  }, [treeReady, nameMap]);

  const handleSelectionChange = (ids: string[]) => {
    if (!isVerified && competencyLimit !== null && ids.length > competencyLimit) {
      toast.error(t("editCompetenciesSheet.limitToast", { limit: competencyLimit }));
      return;
    }
    setSelectedIds(ids);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await api.syncCapabilities(companyId, selectedIds);
      if (result.pendingReview) {
        toast.success(result.message || t("editCompetenciesSheet.successDraft"));
      } else if (result.error) {
        toast.error(result.error);
        return;
      } else {
        toast.success(t("editCompetenciesSheet.success"));
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving capabilities:", error);
      toast.error(error instanceof Error ? error.message : t("editCompetenciesSheet.failedToSave"));
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...initialIds].sort());
  const isLoading = loading || !treeReady;

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title={t("editCompetenciesSheet.title")}
      description={
        isVerified
          ? t("editCompetenciesSheet.descriptionVerified")
          : competencyLimit !== null
            ? t("editCompetenciesSheet.descriptionUnverifiedLimited", {
                limit: competencyLimit,
              })
            : t("editCompetenciesSheet.descriptionUnverified")
      }
      size="wide"
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={saving}
      onSave={handleSave}
      saveLabel={hasChanges ? undefined : t("editCompetenciesSheet.noChanges")}
    >
      {isLoading && <EditSheetSkeleton />}
      <div className={isLoading ? "hidden" : "flex flex-col lg:grid lg:grid-cols-[1fr_1.5fr] gap-6 h-full"}>
        {/* Left column: search + selected */}
        <div className="space-y-4 lg:overflow-y-auto">
          <p className="text-sm text-muted-foreground">{t("editCompetenciesSheet.bodyHint")}</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("editCompetenciesSheet.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {selectedIds.length > 0 && (
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
              <h3 className="font-medium text-sm">
                {t("editCompetenciesSheet.selectedCount", { count: selectedIds.length })}
                {competencyLimit !== null && !isVerified && (
                  <span className="text-muted-foreground ml-1">/ {competencyLimit}</span>
                )}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedIds.map((id) => (
                  <Badge
                    key={id}
                    variant={draftAddedSet.has(id) ? "outline" : "default"}
                    className={
                      draftAddedSet.has(id)
                        ? "text-xs bg-amber-50 border-amber-300 text-amber-900 border-dashed"
                        : "text-xs"
                    }
                  >
                    {nameMap[id] ?? id}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Right column: tree */}
        <CapabilityTreeSelector
          selectedCapabilities={selectedIds}
          onSelectionChange={handleSelectionChange}
          onNameMapChange={setNameMap}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          className="h-full min-h-[300px]"
          onReady={handleTreeReady}
        />
      </div>
    </EditSheetLayout>
  );
}
