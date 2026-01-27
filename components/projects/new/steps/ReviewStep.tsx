"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
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
import { useAuth } from "@/hooks/useAuth";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface ReviewStepProps {
  selectedTenderId: string | null;
  selectedCapabilities: string[];
  selectedCompanies: Company[];
  projectName: string;
  projectDescription: string;
  onProjectNameChange: (name: string) => void;
  onProjectDescriptionChange: (description: string) => void;
  leadCompanyId: string;
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
  onProjectCreated,
  onBack,
}: ReviewStepProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [capabilityNames, setCapabilityNames] = useState<Map<string, string>>(
    new Map()
  );
  const [tenderInfo, setTenderInfo] = useState<{
    title: string;
    buyer: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);

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
      const { data, error } = await supabase
        .from("tenders")
        .select("title, buyer")
        .eq("id", selectedTenderId)
        .single();

      if (error) throw error;
      setTenderInfo(data ? { title: data.title, buyer: data.buyer } : null);
    } catch (error) {
      console.error("Error fetching tender info:", error);
    }
  };

  const fetchCapabilityNames = async () => {
    try {
      const { data, error } = await supabase
        .from("company_capabilities_ref")
        .select("id, name")
        .in("id", selectedCapabilities);

      if (error) throw error;

      const nameMap = new Map<string, string>();
      data?.forEach((cap) => {
        nameMap.set(cap.id, cap.name);
      });
      setCapabilityNames(nameMap);
    } catch (error) {
      console.error("Error fetching capability names:", error);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    if (!user) {
      toast.error("User session not available");
      return;
    }

    try {
      setCreating(true);

      // Create the virtual organization (project)
      const { data: project, error: projectError } = await supabase
        .from("virtual_organizations")
        .insert({
          name: projectName,
          description: projectDescription || null,
          lead_company_id: leadCompanyId,
          target_tender_id: selectedTenderId,
          status: "draft",
          project_owner_id: user.id,
        })
        .select()
        .single();

      if (projectError) {
        console.error("Project creation error:", projectError);
        throw new Error(projectError.message);
      }

      // Add the lead company as a member with 'lead' role
      const { error: leadMemberError } = await supabase
        .from("vo_members")
        .insert({
          vo_id: project.id,
          company_id: leadCompanyId,
          role: "lead",
        });

      if (leadMemberError) {
        console.error("Lead member error:", leadMemberError);
        // Continue even if this fails - the project is created
      }

      // Add selected companies as members
      if (selectedCompanies.length > 0) {
        const memberInserts = selectedCompanies.map((company) => ({
          vo_id: project.id,
          company_id: company.id,
          role: "member" as const,
        }));

        const { error: membersError } = await supabase
          .from("vo_members")
          .insert(memberInserts);

        if (membersError) {
          console.error("Members error:", membersError);
          // Continue even if this fails - the project is created
        }
      }

      toast.success("Project created successfully!");
      onProjectCreated(project.id);
    } catch (error) {
      console.error("Error creating project:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create project. Please try again.";
      toast.error(message);
    } finally {
      setCreating(false);
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
              Target Tender
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="font-medium">{tenderInfo.title}</p>
              <p className="text-sm text-muted-foreground">
                Buyer: {tenderInfo.buyer}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Details Form */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-name">Project Name *</Label>
          <Input
            id="project-name"
            placeholder="e.g., Metal Fabrication Project"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="project-description">Project Description</Label>
          <Textarea
            id="project-description"
            placeholder="Describe the project goals and requirements..."
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
            Selected Capabilities ({selectedCapabilities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCapabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No capabilities selected
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
            Project Team ({selectedCompanies.length} companies)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No companies selected
            </p>
          ) : (
            <div className="space-y-3">
              {selectedCompanies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">{company.company_name}</p>
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
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onBack} disabled={creating}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleCreateProject}
          disabled={creating || !projectName.trim()}
          size="lg"
        >
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Create Project
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
