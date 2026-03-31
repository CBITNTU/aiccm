"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { EditSheetLayout } from "@/components/company/EditSheetLayout";
import type { CompanyRecord } from "@/lib/api/types";
import type { PendingChanges } from "@/lib/companyFieldCategories";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface PastProjectForm {
  name: string;
  description: string;
  client: string;
  value: string;
  year: string;
  sector: string;
}

const emptyProject: PastProjectForm = {
  name: "",
  description: "",
  client: "",
  value: "",
  year: "",
  sector: "",
};

function parsePastProjects(raw: string | null | undefined): PastProjectForm[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => ({
        name: p.name || "",
        description: p.description || "",
        client: p.client || "",
        value: p.value || "",
        year: p.year || "",
        sector: p.sector || "",
      }));
    }
  } catch {
    // Legacy plain text
    if (raw.trim().length > 0) {
      return [{ ...emptyProject, name: "Past Projects", description: raw }];
    }
  }
  return [];
}

interface EditExperienceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyData: CompanyRecord;
  companyId: string;
  isVerified: boolean;
  isEditLocked: boolean;
  pendingChanges?: PendingChanges | null;
  onSaved: (updated: CompanyRecord) => void;
  onDataRefresh: () => void;
}

export function EditExperienceSheet({
  open,
  onOpenChange,
  companyData,
  companyId,
  isVerified,
  isEditLocked,
  pendingChanges,
  onSaved,
  onDataRefresh,
}: EditExperienceSheetProps) {
  const [projects, setProjects] = useState<PastProjectForm[]>(() => {
    // Prefer pending/draft changes, fall back to current saved data
    const pendingRaw = pendingChanges?.scalarFields?.pastProjects?.proposed;
    const raw = pendingRaw ?? companyData.pastProjects;
    const parsed = parsePastProjects(raw);
    return parsed.length > 0 ? parsed : [{ ...emptyProject }];
  });

  const updateMutation = useUpdateCompany();
  const queryClient = useQueryClient();

  const addProject = () => {
    setProjects([...projects, { ...emptyProject }]);
  };

  const removeProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  const updateProject = (index: number, field: keyof PastProjectForm, value: string) => {
    const updated = [...projects];
    updated[index] = { ...updated[index], [field]: value };
    setProjects(updated);
  };

  const handleSave = async () => {
    // Filter out empty projects (no name)
    const validProjects = projects.filter((p) => p.name.trim().length > 0);

    try {
      const result = await updateMutation.mutateAsync({
        companyId: companyData.id,
        updates: {
          // Save null instead of "[]" so clearing all projects doesn't create a no-op diff
          pastProjects: validProjects.length > 0 ? JSON.stringify(validProjects) : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyProjects(companyId) });
      onSaved(result.company);
      onDataRefresh();
      toast.success(
        isVerified
          ? "Experience changes saved as draft"
          : "Experience updated successfully",
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
      description="Add your company's project history to improve tender matching accuracy."
      isReviewable={true}
      isVerified={isVerified}
      isEditLocked={isEditLocked}
      isSaving={updateMutation.isPending}
      onSave={handleSave}
    >
      <div className="space-y-6">
        {projects.map((project, idx) => (
          <div key={idx} className="space-y-3">
            {idx > 0 && <Separator />}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Project {idx + 1}</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProject(idx)}
                className="text-destructive hover:text-destructive h-8 px-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`name-${idx}`}>Project Name *</Label>
              <Input
                id={`name-${idx}`}
                value={project.name}
                onChange={(e) => updateProject(idx, "name", e.target.value)}
                placeholder="e.g. Manchester Hospital Extension"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`description-${idx}`}>Description</Label>
              <Textarea
                id={`description-${idx}`}
                value={project.description}
                onChange={(e) => updateProject(idx, "description", e.target.value)}
                placeholder="Brief description of the project scope and your role..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`client-${idx}`}>Client</Label>
                <Input
                  id={`client-${idx}`}
                  value={project.client}
                  onChange={(e) => updateProject(idx, "client", e.target.value)}
                  placeholder="e.g. NHS Trust"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`value-${idx}`}>Approximate Value</Label>
                <Input
                  id={`value-${idx}`}
                  value={project.value}
                  onChange={(e) => updateProject(idx, "value", e.target.value)}
                  placeholder="e.g. 2.5M"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`year-${idx}`}>Year</Label>
                <Input
                  id={`year-${idx}`}
                  value={project.year}
                  onChange={(e) => updateProject(idx, "year", e.target.value)}
                  placeholder="e.g. 2024"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`sector-${idx}`}>Sector</Label>
                <Input
                  id={`sector-${idx}`}
                  value={project.sector}
                  onChange={(e) => updateProject(idx, "sector", e.target.value)}
                  placeholder="e.g. Healthcare, Construction"
                />
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addProject}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Project
        </Button>
      </div>
    </EditSheetLayout>
  );
}
