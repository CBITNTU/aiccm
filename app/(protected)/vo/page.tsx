"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Target,
  Plus,
  Trash2,
  RefreshCw,
  Briefcase,
  FolderOpen,
  Archive,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { ProjectSummary } from "@/components/consulting/ProjectSummary";
import { CoverageMap } from "@/components/consulting/CoverageMap";
import { RecommendedPartners } from "@/components/consulting/RecommendedPartners";
import { TeamBuilder } from "@/components/consulting/TeamBuilder";
import { InvitationManager } from "@/components/consulting/InvitationManager";
import { TenderViewDialog } from "@/components/tenders/TenderViewDialog";
import { api } from "@/lib/api/client";
import {
  useAddTeamMember,
  useRemoveTeamMember,
  useDeleteProject,
  useUpdateProjectStatus,
} from "@/hooks/useProjectMutations";

interface ProjectAnalysis {
  requiredCompetencies: string[];
  companyCompetencies: string[];
  missingCompetencies: string[];
  coveragePercentage: number;
  readinessScore: number;
  risks: string[];
  recommendations?: string[];
}

interface GapAnalysis extends ProjectAnalysis {
  type: "gap";
  analyzedAt: string;
}

interface TeamAnalysis extends ProjectAnalysis {
  type: "team";
  analyzedAt: string;
  teamMembers: {
    companyName: string;
    contribution: string[];
  }[];
}

interface RecommendedPartner {
  id: string;
  company_name: string;
  key_capabilities: string;
  certifications: string;
  location: string;
  relevanceScore: number;
  matchingCompetencies: string[];
}

interface Tender {
  id: string;
  title: string;
  buyer: string;
  location?: string;
  deadline?: string;
  budget_min?: number;
  budget_max?: number;
  description?: string;
  external_id?: string;
  reference_number?: string;
  region?: string;
  value?: number;
  buyer_name?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  lead_company_id: string;
  target_tender_id?: string;
  status: string;
  gap_analysis?: GapAnalysis;
  team_analysis?: TeamAnalysis;
  recommended_partners?: RecommendedPartner[];
  tenders?: Tender;
}

interface TeamMember {
  id: string;
  company_id: string;
  role: string;
  companies?: {
    company_name: string;
    key_capabilities?: string | null;
    postcode?: string | null;
    location?: string | null;
    contact_email?: string | null;
    certifications?: string | null;
    past_projects?: string | null;
    description?: string | null;
  } | null;
}

export default function ConsultingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { selectedOrg, setSelectedOrg } = useOrg();

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tender, setTender] = useState<Tender | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const [teamAnalysis, setTeamAnalysis] = useState<TeamAnalysis | null>(null);
  const [recommendedPartners, setRecommendedPartners] = useState<
    RecommendedPartner[]
  >([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projectFilter, setProjectFilter] = useState<
    "active" | "completed" | "archived"
  >("active");
  const [tenderDialogOpen, setTenderDialogOpen] = useState(false);

  const addTeamMemberMutation = useAddTeamMember();
  const removeTeamMemberMutation = useRemoveTeamMember();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectStatusMutation = useUpdateProjectStatus();

  // Get tender ID and company ID from query params
  const tenderId = searchParams.get("tenderId");
  const routeCompanyId = searchParams.get("companyId");

  // Sync URL companyId param to global org context on mount
  useEffect(() => {
    if (routeCompanyId && routeCompanyId !== selectedOrg?.id) {
      setSelectedOrg(routeCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount/route change
  }, [routeCompanyId]);

  // Use selectedOrg as the owner company
  const ownerCompany = selectedOrg;

  useEffect(() => {
    if (!user) return;

    if (ownerCompany) {
      loadUserProjects(projectFilter);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when ownerCompany/user change
  }, [user?.id, projectFilter, ownerCompany?.id]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when selectedProject change
  }, [selectedProject?.id]);

  // Reset project state when org changes
  useEffect(() => {
    setProjects([]);
    setSelectedProject(null);
    setGapAnalysis(null);
    setTeamAnalysis(null);
    setRecommendedPartners([]);
    setTeamMembers([]);
  }, [ownerCompany?.id]);

  const loadUserProjects = async (statusFilter: string = "active") => {
    if (!ownerCompany) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const data = await api.getProjects({
        companyId: ownerCompany.id,
        status: statusFilter,
      });

      const projectList = (data.projects as unknown as Project[]) || [];
      setProjects(projectList);
      if (projectList.length > 0) {
        setSelectedProject(projectList[0]);
      }
    } catch (error) {
      console.error("Error loading projects:", error);
      toast.error("Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for post-creation callback
  const handleProjectCreated = async (projectId: string) => {
    try {
      setLoading(true);
      await loadUserProjects(projectFilter);

      const data = await api.getProjectDetails(projectId);
      setSelectedProject(data.project as unknown as Project);
      await loadProjectData(projectId);
    } catch (error) {
      console.error("Error loading new project:", error);
      toast.error("Project created but failed to load");
    } finally {
      setLoading(false);
    }
  };

  const loadProjectData = async (voId: string) => {
    try {
      setGapAnalysis(null);
      setTeamAnalysis(null);
      setRecommendedPartners([]);

      const data = await api.getProjectDetails(voId);
      const project = data.project as unknown as Project;

      if (
        ownerCompany &&
        project.lead_company_id !== ownerCompany.id
      ) {
        toast.error(
          "Project does not belong to the selected company. Please select the correct company.",
        );
        return;
      }

      if (project.gap_analysis) {
        setGapAnalysis(project.gap_analysis);
      }
      if (project.team_analysis) {
        setTeamAnalysis(project.team_analysis);
      }
      if (project.recommended_partners) {
        setRecommendedPartners(project.recommended_partners || []);
      }

      setTeamMembers((data.teamMembers as unknown as TeamMember[]) || []);

      // Load tender if associated
      const currentProject = projects.find((p) => p.id === voId) || selectedProject;
      if (currentProject?.target_tender_id) {
        try {
          const tenderData = await api.getTender(currentProject.target_tender_id);
          setTender(tenderData.tender as unknown as Tender);
        } catch {
          setTender(null);
        }
      } else {
        setTender(null);
      }
    } catch (error) {
      console.error("Error loading project data:", error);
    }
  };

  const runGapAnalysis = async (
    voId: string,
    company: Company,
    tenderData: Tender,
  ) => {
    try {
      setAnalyzing(true);
      toast.info("Starting gap analysis...");

      const aiData = await api.analyzeProjectSimple({
        projectId: voId,
        companyId: company.id,
        tenderId: tenderData.id,
      });

      const analysis = aiData.analysis;

      // Get partner recommendations
      const missingComps = analysis.missingCompetencies || [];
      let recommendations: RecommendedPartner[] = [];

      if (missingComps.length > 0) {
        const dirData = await api.getDirectory({ limit: 100 });
        const companies = (dirData.companies || []) as unknown as {
          id: string;
          company_name: string;
          key_capabilities?: string | null;
          certifications?: string | null;
          past_projects?: string | null;
          description?: string | null;
          postcode?: string | null;
        }[];

        if (companies.length > 0) {
          const scored = companies
            .filter((c) => c.id !== company.id)
            .map((c) => {
              const capText = (c.key_capabilities || "").toLowerCase();
              const certText = (c.certifications || "").toLowerCase();
              const projText = (c.past_projects || "").toLowerCase();
              const descText = (c.description || "").toLowerCase();
              const allText = `${capText} ${certText} ${projText} ${descText}`;

              const matchingComps: string[] = [];

              missingComps.forEach((comp: string) => {
                const compLower = comp.toLowerCase();
                const compWords = compLower.split(/\s+/);

                const hasMatch = compWords.some(
                  (word: string) => word.length > 3 && allText.includes(word),
                );

                if (hasMatch || allText.includes(compLower)) {
                  matchingComps.push(comp);
                }
              });

              const relevanceScore =
                missingComps.length > 0
                  ? Math.round((matchingComps.length / missingComps.length) * 100)
                  : 0;

              return {
                id: c.id,
                company_name: c.company_name,
                key_capabilities: c.key_capabilities || "Not specified",
                certifications: c.certifications || "Not specified",
                location: c.postcode || "Not specified",
                relevanceScore,
                matchingCompetencies: matchingComps,
              };
            });

          recommendations = scored
            .filter((c) => c.relevanceScore >= 20)
            .toSorted((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 10);
        }
      }

      const gapAnalysisData: GapAnalysis = {
        ...analysis,
        type: "gap",
        analyzedAt: new Date().toISOString(),
      };

      setGapAnalysis(gapAnalysisData);
      setRecommendedPartners(recommendations);

      // Save gap analysis to database via API
      await api.updateProject(voId, {
        gap_analysis: gapAnalysisData,
        recommended_partners: recommendations,
      });

      const partnerCount = recommendations.length;
      const gaps = analysis.missingCompetencies?.length || 0;

      toast.success(
        `Gap analysis complete! Coverage: ${analysis.coveragePercentage}%, ` +
          `${gaps} gaps identified, ${partnerCount} partners recommended`,
      );
    } catch (error) {
      console.error("Error running gap analysis:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to run gap analysis",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const runTeamAnalysis = async (
    voId: string,
    company: Company,
    tenderData: Tender,
    members: TeamMember[],
  ) => {
    try {
      setAnalyzing(true);
      toast.info("Starting team analysis...");

      const result = await api.analyzeTeam({
        projectId: voId,
        company: {
          id: company.id,
          company_name: company.company_name,
          key_capabilities: company.key_capabilities,
          certifications: company.certifications,
          past_projects: company.past_projects,
          description: company.description,
        },
        tender: {
          title: tenderData.title,
          description: tenderData.description,
          buyer_name: tenderData.buyer_name || tenderData.buyer,
          value: tenderData.value,
          region: tenderData.region || tenderData.location,
        },
        teamMembers: members.map((m) => ({
          companies: m.companies
            ? {
                company_name: m.companies.company_name,
                key_capabilities: m.companies.key_capabilities,
                certifications: m.companies.certifications,
                past_projects: m.companies.past_projects,
                description: m.companies.description,
              }
            : null,
        })),
      });

      const teamAnalysisData: TeamAnalysis = {
        ...result.teamAnalysis,
      };

      setTeamAnalysis(teamAnalysisData);

      const gaps = teamAnalysisData.missingCompetencies?.length || 0;

      toast.success(
        `Team analysis complete! Coverage: ${teamAnalysisData.coveragePercentage}%, ` +
          `${gaps} gaps remaining with current team`,
      );
    } catch (error) {
      console.error("Error running team analysis:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to run team analysis",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddPartner = async (partnerId: string) => {
    if (!selectedProject) return;

    try {
      await addTeamMemberMutation.mutateAsync({
        projectId: selectedProject.id,
        companyId: partnerId,
      });
      toast.success("Partner added to team");
      await loadProjectData(selectedProject.id);
    } catch (error) {
      console.error("Error adding partner:", error);
      const message = error instanceof Error ? error.message : "Failed to add partner";
      if (message.includes("duplicate") || message.includes("already")) {
        toast.error("Company is already a team member");
      } else {
        toast.error("Failed to add partner");
      }
    }
  };

  const handleRemovePartner = async (memberId: string) => {
    if (!selectedProject) return;

    try {
      await removeTeamMemberMutation.mutateAsync({
        memberId,
        projectId: selectedProject.id,
      });
      await loadProjectData(selectedProject.id);
      toast.success("Partner removed from team");
    } catch (error) {
      console.error("Error removing partner:", error);
      toast.error("Failed to remove partner");
    }
  };

  const handleRunGapAnalysis = async () => {
    if (!selectedProject || !ownerCompany || !tender) {
      toast.error("Missing project, company, or tender information");
      return;
    }

    if (selectedProject.lead_company_id !== ownerCompany.id) {
      toast.error(
        "Company mismatch: This project belongs to a different company.",
      );
      return;
    }

    try {
      const data = await api.getCompany(selectedProject.lead_company_id);
      const leadCompany = data.company;
      if (!leadCompany) {
        toast.error("Failed to load company information");
        return;
      }
      await runGapAnalysis(selectedProject.id, leadCompany, tender);
    } catch {
      toast.error("Failed to load company information");
    }
  };

  const handleRunTeamAnalysis = async () => {
    if (!selectedProject || !ownerCompany || !tender) {
      toast.error("Missing project, company, or tender information");
      return;
    }
    if (teamMembers.length === 0) {
      toast.error("Add at least one partner before running team analysis");
      return;
    }

    if (selectedProject.lead_company_id !== ownerCompany.id) {
      toast.error(
        "Company mismatch: This project belongs to a different company.",
      );
      return;
    }

    try {
      const data = await api.getCompany(selectedProject.lead_company_id);
      const leadCompany = data.company;
      if (!leadCompany) {
        toast.error("Failed to load company information");
        return;
      }
      await runTeamAnalysis(selectedProject.id, leadCompany, tender, teamMembers);
    } catch {
      toast.error("Failed to load company information");
    }
  };

  const handleSendInvitations = async (selectedPartnerIds: string[]) => {
    if (!selectedProject?.id) return;

    try {
      toast.info("Sending invitations...");

      await api.sendProjectInvitations(
        selectedProject.id,
        tender?.title || "",
        selectedPartnerIds,
      );

      toast.success(`Sent ${selectedPartnerIds.length} invitation(s)`);
    } catch (error) {
      console.error("Error sending invitations:", error);
      toast.error("Failed to send invitations");
    }
  };

  const handleMoveProject = async (
    newStatus: "delete" | "archived" | "completed",
  ) => {
    if (!selectedProject) {
      toast.error("No project selected");
      return;
    }

    const statusLabels = {
      delete: "delete",
      archived: "archive",
      completed: "mark as completed",
    };

    const confirmMove = window.confirm(
      `Are you sure you want to ${statusLabels[newStatus]} "${
        selectedProject.name
      }"? ${newStatus === "delete" ? "This action cannot be undone." : ""}`,
    );

    if (!confirmMove) return;

    try {
      if (newStatus === "delete") {
        toast.info("Deleting project...");
        await deleteProjectMutation.mutateAsync({ projectId: selectedProject.id });
        toast.success("Project deleted successfully");
      } else {
        toast.info(`Moving project to ${newStatus}...`);
        await updateProjectStatusMutation.mutateAsync({
          projectId: selectedProject.id,
          status: newStatus,
        });
        toast.success(
          `Project ${
            newStatus === "completed" ? "marked as completed" : "archived"
          } successfully`,
        );
      }

      const updatedProjects = projects.filter(
        (p) => p.id !== selectedProject.id,
      );
      setProjects(updatedProjects);

      setGapAnalysis(null);
      setTeamAnalysis(null);
      setRecommendedPartners([]);
      setTeamMembers([]);
      setTender(null);

      if (updatedProjects.length > 0) {
        setSelectedProject(updatedProjects[0]);
      } else {
        setSelectedProject(null);
      }
    } catch (error) {
      console.error("Error moving project:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to move project",
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (
    !tenderId &&
    (!ownerCompany || (projects.length === 0 && projectFilter === "active")) &&
    !loading
  ) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold">Build Your Consulting Team</h1>
              <p className="text-muted-foreground mt-2">
                Create projects, analyze tenders, and form winning consortiums
              </p>
            </div>

            {!ownerCompany && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    No Organization Selected
                  </CardTitle>
                  <CardDescription>
                    Select an organization from the sidebar to manage your consulting projects
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Projects Yet</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  {ownerCompany
                    ? "Start by creating a consulting project. You can link it to a tender and build your team."
                    : "Please select a company from the sidebar to start creating projects."}
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      if (ownerCompany) {
                        router.push(
                          `/projects/new?companyId=${ownerCompany.id}`,
                        );
                      }
                    }}
                    size="lg"
                    disabled={!ownerCompany}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Your First Project
                  </Button>
                  <Button
                    onClick={() => router.push("/tenders")}
                    variant="outline"
                    size="lg"
                  >
                    Browse Tenders
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Consulting Team Builder</h1>
              <p className="text-muted-foreground mt-2">
                Analyze requirements, find partners, and build winning
                consortiums
              </p>
            </div>
            {!tenderId && ownerCompany && (
              <Button
                onClick={() =>
                  router.push(`/projects/new?companyId=${ownerCompany.id}`)
                }
              >
                <Plus className="h-5 w-5 mr-2" />
                New Project
              </Button>
            )}
          </div>

          {/* Project Filter Tabs */}
          {!tenderId && (
            <Tabs
              value={projectFilter}
              onValueChange={(value) =>
                setProjectFilter(value as "active" | "completed" | "archived")
              }
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="active">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Active
                </TabsTrigger>
                <TabsTrigger value="completed">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Completed
                </TabsTrigger>
                <TabsTrigger value="archived">
                  <Archive className="h-4 w-4 mr-2" />
                  Archived
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Empty State for filtered tabs */}
          {!tenderId && projects.length === 0 && projectFilter !== "active" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                {projectFilter === "completed" && (
                  <CheckCircle2 className="h-16 w-16 text-muted-foreground mb-4" />
                )}
                {projectFilter === "archived" && (
                  <Archive className="h-16 w-16 text-muted-foreground mb-4" />
                )}
                <h3 className="text-xl font-semibold mb-2">
                  No{" "}
                  {projectFilter.charAt(0).toUpperCase() +
                    projectFilter.slice(1)}{" "}
                  Projects
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  You don&apos;t have any {projectFilter} projects yet.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Project Selector */}
          {!tenderId && projects.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label htmlFor="project-select">Select Project:</Label>
                    <div className="flex gap-2 mt-2">
                      <Select
                        value={selectedProject?.id || ""}
                        onValueChange={(value) => {
                          const project = projects.find((p) => p.id === value);
                          setSelectedProject(project || null);
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select a project">
                            {selectedProject ? (
                              <span>
                                {selectedProject.name}
                                {ownerCompany && (
                                  <span className="text-muted-foreground text-sm ml-2">
                                    ({ownerCompany.company_name})
                                  </span>
                                )}
                              </span>
                            ) : (
                              "Select a project"
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              <div className="flex flex-col">
                                <span>
                                  {project.name}{" "}
                                  {project.tenders &&
                                    `- ${project.tenders.title}`}
                                </span>
                                {ownerCompany && (
                                  <span className="text-xs text-muted-foreground">
                                    Lead: {ownerCompany.company_name}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedProject && projects.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              title="Project actions"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleMoveProject("delete")}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleMoveProject("archived")}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive Project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleMoveProject("completed")}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Mark as Completed
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project Summary */}
          {tender && (
            <ProjectSummary
              tender={tender}
              ownerCompany={ownerCompany}
              onCardClick={() => setTenderDialogOpen(true)}
            />
          )}

          {/* Only show analysis features for active projects */}
          {(projectFilter === "active" || tenderId) && (
            <>
              <Separator />

              {/* Step 1: Gap Analysis Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                      <Target className="h-6 w-6" />
                      Step 1: Gap Analysis
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Analyze your company&apos;s capabilities vs tender
                      requirements
                    </p>
                  </div>
                  <Button
                    onClick={handleRunGapAnalysis}
                    disabled={analyzing || !ownerCompany || !tender}
                    size="lg"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {gapAnalysis
                          ? "Re-run Gap Analysis"
                          : "Run Gap Analysis"}
                      </>
                    )}
                  </Button>
                </div>

                {!tender && selectedProject && (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        No Tender Selected
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        This project is not linked to a tender. Link a tender to
                        run deep analysis.
                      </p>
                      <Button
                        onClick={() => router.push("/tenders")}
                        variant="outline"
                      >
                        Browse Tenders
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {tender && analyzing && (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                      <h3 className="font-semibold mb-2">
                        AI Analysis in Progress
                      </h3>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Analyzing tender requirements, comparing with your
                        team&apos;s competencies, identifying gaps, and
                        searching for recommended partners from the database...
                      </p>
                    </CardContent>
                  </Card>
                )}

                {tender && (gapAnalysis || teamAnalysis) && !analyzing && (
                  <>
                    <CoverageMap analysis={teamAnalysis || gapAnalysis} />
                    <RecommendedPartners
                      partners={recommendedPartners}
                      onAddPartner={handleAddPartner}
                    />
                  </>
                )}
              </div>

              <Separator />

              {/* Team Builder */}
              <TeamBuilder
                members={teamMembers}
                onRemoveMember={handleRemovePartner}
                onAddCompany={handleAddPartner}
                onRunGroupAnalysis={handleRunTeamAnalysis}
                analyzing={analyzing}
                teamAnalysis={teamAnalysis}
              />

              <Separator />

              {/* Invitation Manager */}
              <InvitationManager
                members={teamMembers}
                onSendInvitations={handleSendInvitations}
                projectTitle={tender?.title || selectedProject?.name}
              />
            </>
          )}

          {/* Read-only view for completed/archived projects */}
          {(projectFilter === "completed" || projectFilter === "archived") && (
            <>
              <Separator />

              {/* Team Members (Read-only) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Team Members
                  </CardTitle>
                  <CardDescription>
                    Companies that were part of this project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {teamMembers.length > 0 ? (
                    <div className="space-y-3">
                      {teamMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                {member.companies?.company_name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.companies?.key_capabilities?.substring(
                                  0,
                                  100,
                                )}
                                ...
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary">{member.role}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No team members were added to this project
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Tender View Dialog */}
        <TenderViewDialog
          tender={tender}
          open={tenderDialogOpen}
          onOpenChange={setTenderDialogOpen}
        />
      </div>
    </div>
  );
}
