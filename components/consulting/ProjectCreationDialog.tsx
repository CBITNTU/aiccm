"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Briefcase,
  Search,
  X,
  Building2,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { TenderSearchDialog } from "./TenderSearchDialog";

interface Tender {
  id: string;
  title: string;
  buyer: string;
  buyer_name?: string;
  deadline: string | null;
}

interface ProjectCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (projectId: string) => void;
  companyId: string;
}

export function ProjectCreationDialog({
  open,
  onOpenChange,
  onProjectCreated,
  companyId,
}: ProjectCreationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({ name: "", description: "" });
      setSelectedTender(null);
    }
  }, [open]);

  const handleSelectTender = (tender: Tender) => {
    setSelectedTender(tender);
  };

  const handleClearTender = () => {
    setSelectedTender(null);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "No deadline";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    try {
      setLoading(true);

      const result = await api.createProject({
        name: formData.name,
        description: formData.description || undefined,
        target_tender_id: selectedTender?.id || null,
        company_id: companyId,
      });

      const project = result.project as { id: string };

      toast.success("Project created!");
      onProjectCreated(project.id);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error creating project:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create project. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Create Project
            </DialogTitle>
            <DialogDescription>
              Start a new project and build your team to bid on tenders
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                placeholder="e.g., Digital Transformation Project"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Describe the project goals and objectives..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Target Tender (Optional)</Label>
              {selectedTender ? (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium line-clamp-1">
                          {selectedTender.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {selectedTender.buyer_name || selectedTender.buyer}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(selectedTender.deadline)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchDialogOpen(true)}
                        >
                          Change
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleClearTender}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setSearchDialogOpen(true)}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search for a tender...
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                You can link a tender later from the project setup
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TenderSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        onSelectTender={handleSelectTender}
      />
    </>
  );
}
