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
  const [website, setWebsite] = useState(companyData.websiteUrl || "");

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
          websiteUrl: website.trim(),
        },
      });
      onSaved(result.company);
      toast.success(
        isVerified
          ? "Contact details updated. Company name change saved as draft."
          : "Company information updated successfully",
      );
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
      title="Edit Company Info"
      description="Update your company's basic information and contact details."
      isReviewable={false}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
      saveLabel="Save Changes"
    >
      {/* Non-reviewable fields - save immediately */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" />
          <span>Saves immediately</span>
          <div className="h-px bg-border flex-1" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Contact Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@company.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 ..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address / Location</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address or postcode"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Reviewable field */}
      <Separator className="my-2" />
      <div className="space-y-4">
        {isVerified && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Company name changes require admin review</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name</Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company Name"
          />
        </div>
      </div>
    </EditSheetLayout>
  );
}
