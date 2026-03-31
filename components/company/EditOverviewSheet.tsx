"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import type { CompanyRecord } from "@/lib/api/types";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";

interface EditOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  isVerified: boolean;
  isEditLocked: boolean;
  onSaved: (updated: CompanyRecord) => void;
}

export function EditOverviewSheet({
  open,
  onOpenChange,
  companyData,
  isVerified,
  isEditLocked,
  onSaved,
}: EditOverviewSheetProps) {
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
      onSaved(result.company);
      toast.success(
        isVerified
          ? "Overview changes saved as draft"
          : "Overview updated successfully",
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
      title="Edit Overview"
      description="Update your company description and key capabilities."
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your company..."
          rows={6}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="keyCapabilities">Key Capabilities</Label>
        <Textarea
          id="keyCapabilities"
          value={keyCapabilities}
          onChange={(e) => setKeyCapabilities(e.target.value)}
          placeholder="Key capabilities (comma-separated)..."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Separate capabilities with commas
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="certifications">Certifications</Label>
        <Textarea
          id="certifications"
          value={certifications}
          onChange={(e) => setCertifications(e.target.value)}
          placeholder="ISO 9001, ISO 14001, Constructionline Gold, CHAS..."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          List your certifications, accreditations, and standards
        </p>
      </div>
    </EditSheetLayout>
  );
}
