"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import { CapabilityTreeSelector } from "@/components/tenders/CapabilityTreeSelector";
import { api } from "@/lib/api/client";

interface EditCompetenciesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  isVerified: boolean;
  isEditLocked: boolean;
  competencyLimit: number | null;
  onSaved: () => void;
}

export function EditCompetenciesSheet({
  open,
  onOpenChange,
  companyId,
  isVerified,
  isEditLocked,
  competencyLimit,
  onSaved,
}: EditCompetenciesSheetProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api
        .getCompanyCapabilities(companyId)
        .then((data) => {
          const ids = data.capabilities.map((c) => c.id);
          setSelectedIds(ids);
          setInitialIds(ids);
        })
        .catch(() => toast.error("Failed to load capabilities"))
        .finally(() => setLoading(false));
    }
  }, [open, companyId]);

  const handleSelectionChange = (ids: string[]) => {
    if (!isVerified && competencyLimit !== null && ids.length > competencyLimit) {
      toast.error(
        `Unverified companies can select up to ${competencyLimit} competencies. Get verified to unlock unlimited.`,
      );
      return;
    }
    setSelectedIds(ids);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await api.syncCapabilities(companyId, selectedIds);
      if (result.pendingReview) {
        toast.success(result.message || "Competency changes saved as draft.");
      } else if (result.error) {
        toast.error(result.error);
        return;
      } else {
        toast.success("Competencies updated");
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving capabilities:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...initialIds].sort());

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Competencies"
      description={
        isVerified
          ? "Select capabilities. Changes require admin review."
          : competencyLimit !== null
            ? `Select up to ${competencyLimit} capabilities. Get verified to unlock unlimited.`
            : "Select capabilities your company has."
      }
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={saving}
      onSave={handleSave}
      saveLabel={hasChanges ? undefined : "No Changes"}
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {selectedIds.length > 0 && (
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
              <h3 className="font-medium text-sm">
                Selected ({selectedIds.length})
                {competencyLimit !== null && !isVerified && (
                  <span className="text-muted-foreground ml-1">/ {competencyLimit}</span>
                )}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedIds.map((id) => (
                  <Badge key={id} variant="default" className="text-xs">
                    {nameMap[id] ?? id}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <CapabilityTreeSelector
            selectedCapabilities={selectedIds}
            onSelectionChange={handleSelectionChange}
            onNameMapChange={setNameMap}
          />
        </>
      )}
    </EditSheetLayout>
  );
}
