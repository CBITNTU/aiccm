"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import type { CompanyRecord } from "@/lib/api/types";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
import type { CompanyUpdateResult } from "@/hooks/useCompanyPageData";

interface EditOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  isVerified: boolean;
  isEditLocked: boolean;
  onSaved: (result: CompanyUpdateResult) => void;
}

export function EditOverviewSheet({
  open,
  onOpenChange,
  companyData,
  isVerified,
  isEditLocked,
  onSaved,
}: EditOverviewSheetProps) {
  const t = useTranslations("CompanyPage");
  const [description, setDescription] = useState(companyData.description || "");
  const [keyCapabilities, setKeyCapabilities] = useState(companyData.keyCapabilities || "");
  const [certifications, setCertifications] = useState(companyData.certifications || "");

  const updateMutation = useUpdateCompany();

  const handleSave = async () => {
    try {
      const result = await updateMutation.mutateAsync({
        companyId: companyData.id,
        updates: {
          description: description,
          keyCapabilities: keyCapabilities,
          certifications: certifications,
        },
      });
      onSaved(result);
      toast.success(
        isVerified ? t("editOverview.successDraft") : t("editOverview.success"),
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error(t("editOverview.error"));
    }
  };

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title={t("editOverview.title")}
      description={t("editOverview.description")}
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <div className="space-y-2">
        <Label htmlFor="description">{t("editOverview.labels.description")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("editOverview.placeholders.description")}
          rows={6}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="keyCapabilities">{t("editOverview.labels.keyCapabilities")}</Label>
        <Textarea
          id="keyCapabilities"
          value={keyCapabilities}
          onChange={(e) => setKeyCapabilities(e.target.value)}
          placeholder={t("editOverview.placeholders.keyCapabilities")}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">{t("editOverview.hints.commaSeparated")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="certifications">{t("editOverview.labels.certifications")}</Label>
        <Textarea
          id="certifications"
          value={certifications}
          onChange={(e) => setCertifications(e.target.value)}
          placeholder={t("editOverview.placeholders.certifications")}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">{t("editOverview.hints.certifications")}</p>
      </div>
    </EditSheetLayout>
  );
}
