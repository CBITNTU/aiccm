"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import type { CompanyRecord } from "@/lib/api/types";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
import { useTranslations } from "next-intl";

interface EditBasicInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  isVerified: boolean;
  isEditLocked: boolean;
  onSaved: (updated: CompanyRecord) => void;
}

export function EditBasicInfoSheet({
  open,
  onOpenChange,
  companyData,
  isVerified,
  isEditLocked,
  onSaved,
}: EditBasicInfoSheetProps) {
  const [companyName, setCompanyName] = useState(companyData.companyName || "");
  const [email, setEmail] = useState(companyData.contactEmail || "");
  const [phone, setPhone] = useState(companyData.contactPhone || "");
  const [address, setAddress] = useState(companyData.address || "");
  const [postcode, setPostcode] = useState(companyData.postcode || "");
  const [website, setWebsite] = useState(companyData.websiteUrl || "");

  const t = useTranslations("CompanyPage");
  const updateMutation = useUpdateCompany();

  const handleSave = async () => {
    try {
      const result = await updateMutation.mutateAsync({
        companyId: companyData.id,
        updates: {
          companyName: companyName.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim(),
          address: address.trim(),
          postcode: postcode.trim(),
          websiteUrl: website.trim(),
        },
      });
      onSaved(result.company);
      toast.success(
        isVerified
          ? t("editInfo.successWithDraft")
          : t("editInfo.success"),
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error(t("editInfo.error"));
    }
  };

  return (
    <EditSheetLayout
      open={open}
      onOpenChange={onOpenChange}
      title={t("editInfo.title")}
      description={t("editInfo.description")}
      isReviewable={false}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
      saveLabel={t("editInfo.saveChanges")}
    >
      {/* Non-reviewable fields - save immediately */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" />
          <span>{t("editInfo.savesImmediately")}</span>
          <div className="h-px bg-border flex-1" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t("editInfo.contactEmail")}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("editInfo.placeholders.email")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">{t("editInfo.phoneNumber")}</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("editInfo.placeholders.phone")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">{t("editInfo.address")}</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("editInfo.placeholders.address")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="postcode">{t("editInfo.postcode")}</Label>
          <Input
            id="postcode"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder={t("editInfo.placeholders.postcode")}
          />
          <p className="text-xs text-muted-foreground">
            {t("editInfo.postcodeHint")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">{t("editInfo.website")}</Label>
          <Input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t("editInfo.placeholders.website")}
          />
        </div>
      </div>

      {/* Reviewable field */}
      <Separator className="my-2" />
      <div className="space-y-4">
        {isVerified && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{t("editInfo.nameReviewRequired")}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="companyName">{t("editInfo.companyName")}</Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("editInfo.placeholders.companyName")}
          />
        </div>
      </div>
    </EditSheetLayout>
  );
}
