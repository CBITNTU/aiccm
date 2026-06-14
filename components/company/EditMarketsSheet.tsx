"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import { EditSheetSkeleton } from "@/components/company/EditSheetSkeleton";
import { MarketTreeSelector } from "@/components/company/MarketTreeSelector";
import { api } from "@/lib/api/client";
import { useCompanyMarkets } from "@/hooks/useCompanyTaxonomy";
import type { PendingChangesRelationField } from "@/lib/companyFieldCategories";

interface EditMarketsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  isVerified: boolean;
  isEditLocked: boolean;
  pendingRelation?: PendingChangesRelationField;
  onSaved: () => void;
}

export function EditMarketsSheet({
  open,
  onOpenChange,
  companyId,
  isVerified,
  isEditLocked,
  pendingRelation,
  onSaved,
}: EditMarketsSheetProps) {
  const t = useTranslations("CompanyPage");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [treeReady, setTreeReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Company's current markets come from the shared cache the tab already
  // populated, so opening the sheet triggers no extra request (only enabled while open).
  const companyMarketsQuery = useCompanyMarkets(open ? companyId : undefined);
  const loading = open && companyMarketsQuery.isPending;

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
    if (companyMarketsQuery.isError) {
      toast.error(t("editMarketsSheet.failedToLoad"));
      return;
    }
    const data = companyMarketsQuery.data;
    if (!data) return;
    const markets = data.markets || [];
    const approvedIds = markets.map((m) => m.id);
    const effectiveIds = pendingRelation ? pendingRelation.proposed : approvedIds;
    setSelectedIds(effectiveIds);
    setInitialIds(effectiveIds);
    setNameMap(Object.fromEntries(markets.map((m) => [m.id, m.name])));
  }, [open, companyMarketsQuery.data, companyMarketsQuery.isError, pendingRelation, t]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await api.syncMarkets(companyId, selectedIds);
      if (result.draftSaved) {
        toast.success(result.message || t("editMarketsSheet.successDraft"));
      } else {
        toast.success(t("editMarketsSheet.success"));
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving markets:", error);
      toast.error(error instanceof Error ? error.message : t("editMarketsSheet.failedToSave"));
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
      title={t("editMarketsSheet.title")}
      description={t("editMarketsSheet.description")}
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={saving}
      onSave={handleSave}
      saveLabel={hasChanges ? undefined : t("editMarketsSheet.noChanges")}
    >
      {isLoading && <EditSheetSkeleton />}
      <div className={isLoading ? "hidden" : "flex flex-col lg:grid lg:grid-cols-[1fr_1.5fr] gap-6 h-full"}>
        {/* Left column: search + selected */}
        <div className="space-y-4 lg:overflow-y-auto">
          <p className="text-sm text-muted-foreground">{t("editMarketsSheet.bodyHint")}</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("editMarketsSheet.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {selectedIds.length > 0 && (
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
              <h3 className="font-medium text-sm">
                {t("editMarketsSheet.selectedCount", { count: selectedIds.length })}
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
        <MarketTreeSelector
          selectedMarketIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onNameMapChange={(map) => setNameMap((prev) => ({ ...prev, ...map }))}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          className="h-full min-h-[300px]"
          onReady={handleTreeReady}
        />
      </div>
    </EditSheetLayout>
  );
}
