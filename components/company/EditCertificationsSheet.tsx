"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import type { CompanyRecord } from "@/lib/api/types";
import type { Certification } from "@/components/company/companyParsers";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";

interface EditCertificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  certifications: Certification[];
  isVerified: boolean;
  isEditLocked: boolean;
  onSaved: (updated: CompanyRecord) => void;
}

export function EditCertificationsSheet({
  open,
  onOpenChange,
  companyData,
  certifications,
  isVerified,
  isEditLocked,
  onSaved,
}: EditCertificationsSheetProps) {
  const [edited, setEdited] = useState<Certification[]>([]);
  const updateMutation = useUpdateCompany();

  useEffect(() => {
    if (open) {
      setEdited(certifications.map((c) => ({ ...c })));
    }
  }, [open, certifications]);

  const updateCert = (idx: number, field: keyof Certification, value: string) => {
    const updated = [...edited];
    updated[idx] = { ...updated[idx], [field]: value };
    setEdited(updated);
  };

  const removeCert = (idx: number) => {
    setEdited(edited.filter((_, i) => i !== idx));
  };

  const addCert = () => {
    setEdited([...edited, { name: "" }]);
  };

  const handleSave = async () => {
    const filtered = edited.filter((c) => c.name.trim());
    try {
      const result = await updateMutation.mutateAsync({
        companyId: companyData.id,
        updates: {
          certifications: JSON.stringify(filtered),
        },
      });
      onSaved(result.company);
      toast.success(
        isVerified
          ? "Certification changes saved as draft"
          : "Certifications updated successfully",
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
      title="Edit Certifications"
      description="Manage your company's certifications and accreditations."
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <div className="space-y-3">
        {edited.map((cert, idx) => (
          <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 space-y-2">
                <div>
                  <Label className="text-xs">Certification Name</Label>
                  <Input
                    value={cert.name}
                    onChange={(e) => updateCert(idx, "name", e.target.value)}
                    placeholder="e.g. ISO 9001"
                  />
                </div>
                <div>
                  <Label className="text-xs">Issuer</Label>
                  <Input
                    value={cert.issuer || ""}
                    onChange={(e) => updateCert(idx, "issuer", e.target.value)}
                    placeholder="Issuing body"
                  />
                </div>
                <div>
                  <Label className="text-xs">Valid Until</Label>
                  <Input
                    value={cert.validUntil || ""}
                    onChange={(e) => updateCert(idx, "validUntil", e.target.value)}
                    placeholder="e.g. 2027-12"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeCert(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" className="w-full" onClick={addCert}>
        <Plus className="h-4 w-4 mr-2" />
        Add Certification
      </Button>
    </EditSheetLayout>
  );
}
