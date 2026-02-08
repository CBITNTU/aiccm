"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { useAuth } from "@/hooks/useAuth";
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
import { CompanySelector } from "@/components/consulting/CompanySelector";
import { TenderViewDialog } from "@/components/tenders/TenderViewDialog";
import { api } from "@/lib/api/client";

type Company = Database["public"]["Tables"]["companies"]["Row"];

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
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tender, setTender] = useState<Tender | null>(null);
  const [ownerCompany, setOwnerCompany] = useState<Company | null>(null);
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

  // Get tender ID and company ID from query params
  const tenderId = searchParams.get("tenderId");
  const routeCompanyId = searchParams.get("companyId");

  // Initialize supabase client
  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  // Load company from route state if provided
  useEffect(() => {
    const loadCompanyFromRoute = async () => {
      if (!user || !routeCompanyId || !supabase) return;

      // Only load if we don't already have this company selected
      if (ownerCompany?.id === routeCompanyId) return;

      try {
        const { data: company, error } = await supabase
          .from("companies")
          .select("*")
          .eq("id", routeCompanyId)
          .eq("user_id", user.id)
          .single();

        if (error) {
          console.error("Error loading company from route:", error);
          return;
        }

        if (company) {
          setOwnerCompany(company);
        }
      } catch (error) {
        console.error("Error loading company:", error);
      }
    };

    loadCompanyFromRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when route/user/supabase change
  }, [user?.id, routeCompanyId, supabase]);

  useEffect(() => {
    if (!user || !supabase) return;

    if (ownerCompany) {
      loadUserProjects(projectFilter);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when ownerCompany/user/supabase change
  }, [user?.id, projectFilter, ownerCompany?.id, supabase]);

  useEffect(() => {
    if (selectedProject && supabase) {
      loadProjectData(selectedProject.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when selectedProject/supabase change
  }, [selectedProject?.id, supabase]);

  const loadUserProjects = async (statusFilter: string = "active") => {
    if (!supabase || !ownerCompany) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const statusesToQuery =
        statusFilter === "active" ? ["draft", "active"] : [statusFilter];

      const { data, error } = await supabase
        .from("virtual_organizations")
        .select(
          `
          *,
          tenders:target_tender_id (
            id,
            title,
            buyer,
            deadline
          )
        `,
        )
        .eq("lead_company_id", ownerCompany.id)
        .in("status", statusesToQuery)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Could not load projects:", error);
        setProjects([]);
      } else {
        setProjects((data as unknown as Project[]) || []);
        if (data && data.length > 0) {
          setSelectedProject(data[0] as unknown as Project);
        }
      }
    } catch (error) {
      console.error("Error loading projects:", error);
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for post-creation callback
  const handleProjectCreated = async (projectId: string) => {
    if (!supabase) return;

    try {
      setLoading(true);
      await loadUserProjects(projectFilter);

      const { data: newProject, error } = await supabase
        .from("virtual_organizations")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) {
        console.error("Failed to load new project:", error);
        throw error;
      }

      setSelectedProject(newProject as unknown as Project);
      await loadProjectData(projectId);
    } catch (error) {
      console.error("Error loading new project:", error);
      toast.error("Project created but failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySelect = (company: Company | null) => {
    const companyChanged = ownerCompany?.id !== company?.id;
    setOwnerCompany(company);

    if (company && companyChanged) {
      setProjects([]);
      setSelectedProject(null);
      setGapAnalysis(null);
      setTeamAnalysis(null);
      setRecommendedPartners([]);
      setTeamMembers([]);
    }
  };

  const loadProjectData = async (voId: string) => {
    if (!supabase) return;

    try {
      setGapAnalysis(null);
      setTeamAnalysis(null);
      setRecommendedPartners([]);

      const { data: projectDetails } = await supabase
        .from("virtual_organizations")
        .select("*")
        .eq("id", voId)
        .maybeSingle();

      if (
        projectDetails &&
        ownerCompany &&
        projectDetails.lead_company_id !== ownerCompany.id
      ) {
        toast.error(
          "Project does not belong to the selected company. Please select the correct company.",
        );
        return;
      }

      const projectData = projectDetails as unknown as {
        gap_analysis?: GapAnalysis;
        team_analysis?: TeamAnalysis;
        recommended_partners?: RecommendedPartner[];
        target_tender_id?: string;
      };

      if (projectData?.gap_analysis) {
        setGapAnalysis(projectData.gap_analysis);
      }
      if (projectData?.team_analysis) {
        setTeamAnalysis(projectData.team_analysis);
      }
      if (projectData?.recommended_partners) {
        setRecommendedPartners(projectData.recommended_partners || []);
      }

      // Load team members
      const { data: members, error: membersError } = await supabase
        .from("vo_members")
        .select(
          `
          *,
          companies:company_id (*)
        `,
        )
        .eq("vo_id", voId);

      if (membersError) {
        console.warn("Could not load team members:", membersError);
        setTeamMembers([]);
      } else {
        setTeamMembers((members as unknown as TeamMember[]) || []);
      }

      // Load tender if associated
      const project = projects.find((p) => p.id === voId) || selectedProject;
      if (project?.target_tender_id) {
        const { data: tenderData } = await supabase
          .from("tenders")
          .select("*")
          .eq("id", project.target_tender_id)
          .maybeSingle();

        setTender(tenderData as unknown as Tender);
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
    if (!supabase) return;

    try {
      setAnalyzing(true);
      toast.info("Starting gap analysis...");

      const prompt = `
You are a tender analysis expert. Analyze this tender requirement against a single company's capabilities to identify gaps.

Tender: ${tenderData.title}
Description: ${tenderData.description || "Not provided"}
Buyer: ${tenderData.buyer_name || "Not specified"}
Value: £${tenderData.value?.toLocaleString() || "Not specified"}
Location: ${tenderData.region || "UK"}

Company: ${company.company_name}
- Capabilities: ${company.key_capabilities || "Not specified"}
- Certifications: ${company.certifications || "None"}
- Past Projects: ${company.past_projects || "None"}
- Description: ${company.description || "None"}

Provide a detailed JSON analysis with:
1. requiredCompetencies: Array of key competencies needed for this tender (be specific)
2. companyCompetencies: Array of what this company currently has
3. missingCompetencies: Array of gaps that need to be filled
4. coveragePercentage: Number (0-100) of requirement coverage by this company alone
5. readinessScore: Number (0-100) company readiness score
6. risks: Array of potential risks for bidding alone
7. recommendations: Array of strategic recommendations to fill gaps

Return ONLY valid JSON, no markdown.`;

      const aiData = await api.analyzeProjectSimple(prompt);

      const analysis = JSON.parse(aiData.content);

      // Get partner recommendations
      const missingComps = analysis.missingCompetencies || [];
      let recommendations: RecommendedPartner[] = [];

      if (missingComps.length > 0) {
        const { data: companies } = await supabase
          .from("companies")
          .select("*")
          .eq("status", "active")
          .neq("id", company.id)
          .limit(100);

        if (companies && companies.length > 0) {
          const scored = companies.map((c) => {
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
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
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

      // Save gap analysis to database
      await supabase
        .from("virtual_organizations")
        .update({
          gap_analysis:
            gapAnalysisData as unknown as Database["public"]["Tables"]["virtual_organizations"]["Update"]["gap_analysis"],
          recommended_partners:
            recommendations as unknown as Database["public"]["Tables"]["virtual_organizations"]["Update"]["recommended_partners"],
        })
        .eq("id", voId);

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
    if (!supabase) return;

    try {
      setAnalyzing(true);
      toast.info("Starting team analysis...");

      const allCompanies = [company, ...members.map((m) => m.companies)].filter(
        Boolean,
      );

      const prompt = `
You are a tender analysis expert. Analyze this tender against a full consortium team.

Tender: ${tenderData.title}
Description: ${tenderData.description || "Not provided"}
Buyer: ${tenderData.buyer_name || "Not specified"}
Value: £${tenderData.value?.toLocaleString() || "Not specified"}
Location: ${tenderData.region || "UK"}

Team Members:
${allCompanies
  .map(
    (c, idx) => `
${idx + 1}. ${c?.company_name} ${idx === 0 ? "(Lead)" : "(Partner)"}
   - Capabilities: ${c?.key_capabilities || "Not specified"}
   - Certifications: ${c?.certifications || "None"}
   - Past Projects: ${c?.past_projects || "None"}
   - Description: ${c?.description || "None"}
`,
  )
  .join("\n")}

Provide a detailed JSON analysis with:
1. requiredCompetencies: Array of key competencies needed
2. companyCompetencies: Array of combined team capabilities
3. missingCompetencies: Array of any remaining gaps
4. coveragePercentage: Number (0-100) of requirement coverage by full team
5. readinessScore: Number (0-100) team readiness
6. risks: Array of potential risks
7. recommendations: Array of strategic recommendations
8. teamMembers: Array of objects with {companyName: string, contribution: string[]} showing each member's key contributions

Return ONLY valid JSON, no markdown.`;

      const result = await api.analyzeProjectSimple(prompt);

      const analysis = JSON.parse(result.content);

      const teamAnalysisData: TeamAnalysis = {
        ...analysis,
        type: "team",
        analyzedAt: new Date().toISOString(),
        teamMembers: analysis.teamMembers || [],
      };

      setTeamAnalysis(teamAnalysisData);

      // Save team analysis to database
      await supabase
        .from("virtual_organizations")
        .update({
          team_analysis:
            teamAnalysisData as unknown as Database["public"]["Tables"]["virtual_organizations"]["Update"]["team_analysis"],
        })
        .eq("id", voId);

      const gaps = analysis.missingCompetencies?.length || 0;

      toast.success(
        `Team analysis complete! Coverage: ${analysis.coveragePercentage}%, ` +
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
    if (!selectedProject || !supabase) return;

    try {
      const { data: existing } = await supabase
        .from("vo_members")
        .select("id")
        .eq("vo_id", selectedProject.id)
        .eq("company_id", partnerId)
        .maybeSingle();

      if (existing) {
        toast.error("Company is already a team member");
        return;
      }

      const { error } = await supabase.from("vo_members").insert({
        vo_id: selectedProject.id,
        company_id: partnerId,
        role: "invited",
      });

      if (error) {
        console.warn("RLS policy issue when adding member:", error);
        toast.info("Partner added to team (database may have sync issues)");
      } else {
        toast.success("Partner added to team");
      }

      await loadProjectData(selectedProject.id);
    } catch (error) {
      console.error("Error adding partner:", error);
      toast.error("Failed to add partner");
    }
  };

  const handleRemovePartner = async (memberId: string) => {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from("vo_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      if (selectedProject) {
        await loadProjectData(selectedProject.id);
      }
      toast.success("Partner removed from team");
    } catch (error) {
      console.error("Error removing partner:", error);
      toast.error("Failed to remove partner");
    }
  };

  const handleRunGapAnalysis = async () => {
    if (!selectedProject || !ownerCompany || !tender || !supabase) {
      toast.error("Missing project, company, or tender information");
      return;
    }

    if (selectedProject.lead_company_id !== ownerCompany.id) {
      toast.error(
        "Company mismatch: This project belongs to a different company.",
      );
      return;
    }

    const { data: leadCompany, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", selectedProject.lead_company_id)
      .single();

    if (companyError || !leadCompany) {
      toast.error("Failed to load company information");
      return;
    }

    await runGapAnalysis(selectedProject.id, leadCompany, tender);
  };

  const handleRunTeamAnalysis = async () => {
    if (!selectedProject || !ownerCompany || !tender || !supabase) {
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

    const { data: leadCompany, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", selectedProject.lead_company_id)
      .single();

    if (companyError || !leadCompany) {
      toast.error("Failed to load company information");
      return;
    }

    await runTeamAnalysis(selectedProject.id, leadCompany, tender, teamMembers);
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
    if (!selectedProject || !supabase) {
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

        await supabase
          .from("vo_members")
          .delete()
          .eq("vo_id", selectedProject.id);

        const { error: deleteError } = await supabase
          .from("virtual_organizations")
          .delete()
          .eq("id", selectedProject.id);

        if (deleteError) {
          throw new Error("Failed to delete project: " + deleteError.message);
        }

        toast.success("Project deleted successfully");
      } else {
        toast.info(`Moving project to ${newStatus}...`);
        const { error: updateError } = await supabase.rpc(
          "update_project_status",
          {
            project_id: selectedProject.id,
            new_status: newStatus,
          },
        );

        if (updateError) {
          throw new Error(
            "Failed to update project status: " + updateError.message,
          );
        }

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

            {/* Company Selector */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Select Lead Company
                </CardTitle>
                <CardDescription>
                  Choose which company will be the lead for your consulting
                  projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CompanySelector
                  selectedCompanyId={ownerCompany?.id}
                  onCompanySelect={handleCompanySelect}
                  showAddButton={true}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Projects Yet</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  {ownerCompany
                    ? "Start by creating a consulting project. You can link it to a tender and build your team."
                    : "Please select a company above to start creating projects."}
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

          {/* Company Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Select Lead Company
              </CardTitle>
              <CardDescription>
                Choose which company will be the lead for your consulting
                projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompanySelector
                selectedCompanyId={ownerCompany?.id}
                onCompanySelect={handleCompanySelect}
                showAddButton={true}
              />
            </CardContent>
          </Card>

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
