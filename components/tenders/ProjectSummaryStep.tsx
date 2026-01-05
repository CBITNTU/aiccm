"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, CheckCircle2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Taxonomy = Database["public"]["Tables"]["taxonomies"]["Row"];

interface ProjectSummaryStepProps {
  selectedTenderId: string | null;
  selectedTaxonomies: string[];
  selectedCompanies: Company[];
  projectName: string;
  projectDescription: string;
  onProjectNameChange: (name: string) => void;
  onProjectDescriptionChange: (description: string) => void;
  leadCompanyId: string;
  onProjectCreated: (projectId: string) => void;
  onClose: () => void;
}

export function ProjectSummaryStep({
  selectedTenderId,
  selectedTaxonomies,
  selectedCompanies,
  projectName,
  projectDescription,
  onProjectNameChange,
  onProjectDescriptionChange,
  leadCompanyId,
  onProjectCreated,
  onClose,
}: ProjectSummaryStepProps) {
  const { user } = useAuth();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [taxonomyNames, setTaxonomyNames] = useState<Map<string, string>>(new Map());
  const [tenderInfo, setTenderInfo] = useState<{ title: string; buyer: string } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (supabase) {
      if (selectedTaxonomies.length > 0) {
        fetchTaxonomyNames();
      }
      if (selectedTenderId) {
        fetchTenderInfo();
      }
    }
  }, [supabase, selectedTaxonomies, selectedTenderId]);

  const fetchTenderInfo = async () => {
    if (!supabase || !selectedTenderId) return;

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

  const fetchTaxonomyNames = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("taxonomies")
        .select("id, name")
        .in("id", selectedTaxonomies);

      if (error) throw error;

      const nameMap = new Map<string, string>();
      data?.forEach((tax) => {
        nameMap.set(tax.id, tax.name);
      });
      setTaxonomyNames(nameMap);
    } catch (error) {
      console.error("Error fetching taxonomy names:", error);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    if (!supabase || !user) {
      toast.error("Database connection not available");
      return;
    }

    try {
      setCreating(true);

      // Create the virtual organization (project)
      // project_owner_id will be automatically set by the trigger
      const { data: project, error: projectError } = await supabase
        .from("virtual_organizations")
        .insert({
          name: projectName,
          description: projectDescription || null,
          lead_company_id: leadCompanyId,
          target_tender_id: selectedTenderId,
          status: "draft",
          project_owner_id: user.id, // Explicitly set, but trigger will also handle it
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
      onClose();
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
          <CardHeader>
            <CardTitle className="text-lg">Selected Tender</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="font-medium">{tenderInfo.title}</p>
              <p className="text-sm text-muted-foreground">Buyer: {tenderInfo.buyer}</p>
            </div>
          </CardContent>
        </Card>
      )}

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
            rows={4}
            className="mt-1"
          />
        </div>
      </div>

      {/* Selected Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Selected Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedTaxonomies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No capabilities selected</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedTaxonomies.map((taxId) => {
                const name = taxonomyNames.get(taxId) || taxId;
                return (
                  <Badge key={taxId} variant="secondary">
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
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Selected Companies ({selectedCompanies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies selected</p>
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

      {/* Create Button */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onClose} disabled={creating}>
          Cancel
        </Button>
        <Button onClick={handleCreateProject} disabled={creating || !projectName.trim()}>
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Project"
          )}
        </Button>
      </div>
    </div>
  );
}

