"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import { OperationLocationsEditor } from "@/components/company/OperationLocationsEditor";
import type { CompanyRecord } from "@/lib/api/types";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";

interface EditOperationLocationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  operationLocations: string[];
  isEditLocked: boolean;
  onSaved: (updated: CompanyRecord) => void;
}

export function EditOperationLocationsSheet({
  open,
  onOpenChange,
  companyData,
  operationLocations,
  isEditLocked,
  onSaved,
}: EditOperationLocationsSheetProps) {
  const [edited, setEdited] = useState<string[]>([...operationLocations]);
  const updateMutation = useUpdateCompany();

  const handleSave = async () => {
    try {
      const result = await updateMutation.mutateAsync({
        companyId: companyData.id,
        updates: {
          operationLocations: edited,
        },
      });
      onSaved(result.company);
      toast.success("Operation locations updated");
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    }
  };

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Operation Locations"
      description="Set the regions and areas where your company operates."
      isReviewable={false}
      isVerified={false}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <OperationLocationsEditor
        value={edited}
        onChange={setEdited}
        placeholder="e.g. UK borough, postcode area, or custom location"
      />
    </EditSheetLayout>
  );
}
