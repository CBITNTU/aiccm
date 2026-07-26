"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import { OperationLocationsEditor } from "@/components/company/OperationLocationsEditor";
import type { CompanyRecord } from "@/lib/api/types";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
import type { CompanyUpdateResult } from "@/hooks/useCompanyPageData";

interface EditOperationLocationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  operationLocations: string[];
  isEditLocked: boolean;
  onSaved: (result: CompanyUpdateResult) => void;
}

export function EditOperationLocationsSheet({
  open,
  onOpenChange,
  companyData,
  operationLocations,
  isEditLocked,
  onSaved,
}: EditOperationLocationsSheetProps) {
  const t = useTranslations("CompanyPage");
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
      onSaved(result);
      toast.success(t("editOperationLocations.success"));
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error(t("editOperationLocations.error"));
    }
  };

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title={t("editOperationLocations.title")}
      description={t("editOperationLocations.description")}
      isReviewable={false}
      isVerified={false}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <OperationLocationsEditor
        value={edited}
        onChange={setEdited}
        placeholder={t("editOperationLocations.editorPlaceholder")}
      />
    </EditSheetLayout>
  );
}
