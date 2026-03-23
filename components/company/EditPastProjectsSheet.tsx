"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import type { CompanyRecord } from "@/lib/api/types";
import type { PastProject } from "@/components/company/companyParsers";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";

interface EditPastProjectsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  pastProjects: PastProject[];
  isVerified: boolean;
  isEditLocked: boolean;
  onSaved: (updated: CompanyRecord) => void;
}

export function EditPastProjectsSheet({
  open,
  onOpenChange,
  companyData,
  pastProjects,
  isVerified,
  isEditLocked,
  onSaved,
}: EditPastProjectsSheetProps) {
  const [edited, setEdited] = useState<PastProject[]>([]);
  const updateMutation = useUpdateCompany();

  useEffect(() => {
    if (open) {
      setEdited(pastProjects.map((p) => ({ ...p })));
    }
  }, [open, pastProjects]);

  const updateProject = (idx: number, field: keyof PastProject, value: string) => {
    const updated = [...edited];
    updated[idx] = { ...updated[idx], [field]: value };
    setEdited(updated);
  };

  const removeProject = (idx: number) => {
    setEdited(edited.filter((_, i) => i !== idx));
  };

  const addProject = () => {
    setEdited([...edited, { name: "" }]);
  };

  const handleSave = async () => {
    const filtered = edited.filter((p) => p.name.trim());
    try {
      const result = await updateMutation.mutateAsync({
        companyId: companyData.id,
        updates: {
          pastProjects: JSON.stringify(filtered),
        },
      });
      onSaved(result.company);
      toast.success(
        isVerified
          ? "Project changes saved as draft"
          : "Projects updated successfully",
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
      title="Edit Past Projects"
      description="Showcase your company's completed projects and track record."
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <div className="space-y-3">
        {edited.map((project, idx) => (
          <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 space-y-2">
                <div>
                  <Label className="text-xs">Project Name</Label>
                  <Input
                    value={project.name}
                    onChange={(e) => updateProject(idx, "name", e.target.value)}
                    placeholder="Project name"
                  />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={project.description || ""}
                    onChange={(e) => updateProject(idx, "description", e.target.value)}
                    placeholder="Brief description"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Value</Label>
                    <Input
                      value={project.value || ""}
                      onChange={(e) => updateProject(idx, "value", e.target.value)}
                      placeholder="e.g. £500K"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Year</Label>
                    <Input
                      value={project.year || ""}
                      onChange={(e) => updateProject(idx, "year", e.target.value)}
                      placeholder="e.g. 2025"
                    />
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeProject(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" className="w-full" onClick={addProject}>
        <Plus className="h-4 w-4 mr-2" />
        Add Project
      </Button>
    </EditSheetLayout>
  );
}
