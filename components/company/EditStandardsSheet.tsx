"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import { StandardsTreeSelector } from "@/components/company/StandardsTreeSelector";
import { api } from "@/lib/api/client";

interface EditStandardsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  isVerified: boolean;
  isEditLocked: boolean;
  onSaved: () => void;
}

export function EditStandardsSheet({
  open,
  onOpenChange,
  companyId,
  isVerified,
  isEditLocked,
  onSaved,
}: EditStandardsSheetProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api
        .getCompanyStandards(companyId)
        .then((data) => {
          const standards = data.standards || [];
          setSelectedIds(standards.map((s) => s.id));
          setNameMap(Object.fromEntries(standards.map((s) => [s.id, s.name])));
        })
        .catch(() => toast.error("Failed to load standards"))
        .finally(() => setLoading(false));
    }
  }, [open, companyId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await api.syncStandards(companyId, selectedIds);
      if (result.draftSaved) {
        toast.success(result.message || "Standards changes saved as draft.");
      } else {
        toast.success("Standards updated");
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving standards:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Standards & Certifications"
      description="Select standards and certifications your company holds."
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={saving}
      onSave={handleSave}
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
          <StandardsTreeSelector
            selectedStandardIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onNameMapChange={(map) => setNameMap((prev) => ({ ...prev, ...map }))}
            companyId={companyId}
          />
        </>
      )}
    </EditSheetLayout>
  );
}
