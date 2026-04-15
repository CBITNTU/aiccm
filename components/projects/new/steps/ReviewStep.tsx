"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
import { useCreateProject } from "@/hooks/useProjectMutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Users,
  Target,
  Zap,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  companyName: string;
  postcode?: string | null;
  [key: string]: unknown;
}

interface ReviewStepProps {
  selectedTenderId: string | null;
  selectedCapabilities: string[];
  selectedCompanies: Company[];
  projectName: string;
  projectDescription: string;
  onProjectNameChange: (name: string) => void;
  onProjectDescriptionChange: (description: string) => void;
  leadCompanyId: string;
  leadCompanyName: string;
  onProjectCreated: (projectId: string) => void;
  onBack: () => void;
}

export function ReviewStep({
  selectedTenderId,
  selectedCapabilities,
  selectedCompanies,
  projectName,
  projectDescription,
  onProjectNameChange,
  onProjectDescriptionChange,
  leadCompanyId,
  leadCompanyName,
  onProjectCreated,
  onBack,
}: ReviewStepProps) {
  const t = useTranslations("ProjectSummaryStep");
  const { user } = useAuth();
  const createProject = useCreateProject();
  const [capabilityNames, setCapabilityNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [tenderInfo, setTenderInfo] = useState<{
    title: string;
    buyer: string;
  } | null>(null);

  useEffect(() => {
    if (selectedCapabilities.length > 0) {
      fetchCapabilityNames();
    }
    if (selectedTenderId) {
      fetchTenderInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCapabilities, selectedTenderId]);

  // Auto-suggest project name from tender
  useEffect(() => {
    if (tenderInfo && !projectName) {
      const suggestedName = `${tenderInfo.title.substring(0, 50)}${
        tenderInfo.title.length > 50 ? "..." : ""
      } Project`;
      onProjectNameChange(suggestedName);
    }
  }, [tenderInfo, projectName, onProjectNameChange]);

  const fetchTenderInfo = async () => {
    if (!selectedTenderId) return;

    try {
      const result = await api.getTender(selectedTenderId);
      const tender = result.tender as { title: string; buyer: string };
      setTenderInfo({ title: tender.title, buyer: tender.buyer });
    } catch (error) {
      console.error("Error fetching tender info:", error);
    }
  };

  const fetchCapabilityNames = async () => {
    try {
      const result = await api.getCapabilities();
      const nameMap = new Map<string, string>();
      result.capabilities?.forEach((cap) => {
        if (selectedCapabilities.includes(cap.id)) {
          nameMap.set(cap.id, cap.name);
        }
      });
      setCapabilityNames(nameMap);
    } catch (error) {
      console.error("Error fetching capability names:", error);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error(t("validationProjectName"));
      return;
    }

    if (!user) {
      toast.error(t("errorNoSession"));
      return;
    }

    try {
      const project = await createProject.mutateAsync({
        name: projectName,
        description: projectDescription || undefined,
        targetTenderId: selectedTenderId,
        leadCompanyId: leadCompanyId,
      });

      // Add selected companies as members
      const failedMembers: string[] = [];
      for (const company of selectedCompanies) {
        try {
          await api.addProjectMember(project.id as string, company.id);
        } catch (memberError) {
          console.error("Error adding member:", memberError);
          failedMembers.push(company.companyName);
        }
      }

      if (failedMembers.length > 0) {
        toast.warning(t("successPartial", { names: failedMembers.join(", ") }));
      } else {
        toast.success(t("successCreated"));
      }
      onProjectCreated(project.id as string);
    } catch (error) {
      console.error("Error createProject.isPending project:", error);
      const message =
        error instanceof Error
          ? error.message
          : t("errorFallback");
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selected Tender */}
      {tenderInfo && (
        <Card className="bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              {t("targetTender")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="font-medium">{tenderInfo.title}</p>
              <p className="text-sm text-muted-foreground">
                {t("buyer", { buyer: tenderInfo.buyer })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Details Form */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-name">{t("projectNameLabel")}</Label>
          <Input
            id="project-name"
            placeholder={t("projectNamePlaceholder")}
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="project-description">{t("projectDescriptionLabel")}</Label>
          <Textarea
            id="project-description"
            placeholder={t("projectDescriptionPlaceholder")}
            value={projectDescription}
            onChange={(e) => onProjectDescriptionChange(e.target.value)}
            rows={3}
            className="mt-1"
          />
        </div>
      </div>

      {/* Selected Capabilities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            {t("selectedCapabilities")} ({selectedCapabilities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCapabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noCapabilities")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedCapabilities.map((capId) => {
                const name = capabilityNames.get(capId) || capId;
                return (
                  <Badge key={capId} variant="secondary">
                    {name}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Companies */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t("teamTitle", { count: selectedCompanies.length + 1 })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Lead company (always shown) */}
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-primary/5">
              <Building2 className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium">{leadCompanyName}</p>
              </div>
              <Badge variant="default" className="text-xs">{t("badgeLead")}</Badge>
            </div>
            {/* Partner companies */}
            {selectedCompanies.map((company) => (
              <div
                key={company.id}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <Building2 className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">{company.companyName}</p>
                  {company.postcode && (
                    <p className="text-sm text-muted-foreground">
                      {company.postcode}
                    </p>
                  )}
                </div>
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onBack} disabled={createProject.isPending}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          {t("back")}
        </Button>
        <Button
          onClick={handleCreateProject}
          disabled={createProject.isPending || !projectName.trim()}
          size="lg"
        >
          {createProject.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("creating")}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {t("createProject")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
