import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ExternalLink, Users, Target, Lightbulb, Plus, Trash2, Mail, RefreshCw, Briefcase, FolderOpen } from "lucide-react";
import Header from "@/components/Header";
import { ProjectSummary } from "@/components/consulting/ProjectSummary";
import { CoverageMap } from "@/components/consulting/CoverageMap";
import { RecommendedPartners } from "@/components/consulting/RecommendedPartners";
import { TeamBuilder } from "@/components/consulting/TeamBuilder";
import { InvitationManager } from "@/components/consulting/InvitationManager";
import { ProjectCreationDialog } from "@/components/consulting/ProjectCreationDialog";

interface ProjectAnalysis {
  requiredCompetencies: string[];
  companyCompetencies: string[];
  missingCompetencies: string[];
  coveragePercentage: number;
  readinessScore: number;
  risks: string[];
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

export default function Consulting() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [tender, setTender] = useState<any>(null);
  const [ownerCompany, setOwnerCompany] = useState<any>(null);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [recommendedPartners, setRecommendedPartners] = useState<RecommendedPartner[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Get tender ID from route state
  const tenderId = location.state?.tenderId;
  const tenderTitle = location.state?.tenderTitle;

  useEffect(() => {
    if (!user) return;
    
    if (tenderId) {
      initializeProjectFromTender();
    } else {
      loadUserProjects();
    }
  }, [user, tenderId]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject.id);
    }
  }, [selectedProject]);

  const loadUserProjects = async () => {
    try {
      setLoading(true);

      // Get owner company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .maybeSingle();

      if (companyError) throw companyError;
      setOwnerCompany(companyData);

      if (!companyData) {
        setLoading(false);
        return;
      }

      // Load user's projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('virtual_organizations')
        .select(`
          *,
          tenders:target_tender_id (
            id,
            title,
            buyer,
            deadline
          )
        `)
        .eq('lead_company_id', companyData.id)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Auto-select first project if any
      if (projectsData && projectsData.length > 0) {
        setSelectedProject(projectsData[0]);
      }
    } catch (error: any) {
      console.error('Error loading projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const initializeProjectFromTender = async () => {
    try {
      setLoading(true);

      // Get owner company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .single();

      if (companyError) throw companyError;
      setOwnerCompany(companyData);

      // Get tender details
      const { data: tenderData, error: tenderError } = await supabase
        .from('tenders')
        .select('*')
        .eq('id', tenderId)
        .single();

      if (tenderError) throw tenderError;
      setTender(tenderData);

      // Check if project already exists for this tender
      const { data: existingProject, error: projectCheckError } = await supabase
        .from('virtual_organizations')
        .select('*')
        .eq('target_tender_id', tenderId)
        .eq('lead_company_id', companyData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingProject) {
        setSelectedProject(existingProject);
        setProjects([existingProject]);
        await loadProjectData(existingProject.id);
      } else {
        // Create new project
        const { data: newProject, error: createError } = await supabase
          .from('virtual_organizations')
          .insert({
            name: `Project: ${tenderData.title}`,
            description: `Consulting team for tender: ${tenderData.title}`,
            lead_company_id: companyData.id,
            target_tender_id: tenderId,
            status: 'draft'
          })
          .select()
          .single();

        if (createError) throw createError;

        // Add owner as lead member
        await supabase
          .from('vo_members')
          .insert({
            vo_id: newProject.id,
            company_id: companyData.id,
            role: 'lead'
          });

        setSelectedProject(newProject);
        setProjects([newProject]);
        
        // Run initial analysis
        await runDeepAnalysis(newProject.id, companyData, tenderData);
      }

    } catch (error: any) {
      console.error('Error initializing project:', error);
      toast.error('Failed to initialize project');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectCreated = async (projectId: string) => {
    await loadUserProjects();
    
    // Select the newly created project
    const newProject = projects.find(p => p.id === projectId);
    if (newProject) {
      setSelectedProject(newProject);
    }
  };

  const loadProjectData = async (voId: string) => {
    try {
      // Load team members
      const { data: members, error: membersError } = await supabase
        .from('vo_members')
        .select(`
          *,
          companies:company_id (*)
        `)
        .eq('vo_id', voId);

      if (membersError) throw membersError;
      setTeamMembers(members || []);

      // Load tender if associated
      const project = projects.find(p => p.id === voId) || selectedProject;
      if (project?.target_tender_id) {
        const { data: tenderData } = await supabase
          .from('tenders')
          .select('*')
          .eq('id', project.target_tender_id)
          .maybeSingle();
        
        setTender(tenderData);
      } else {
        setTender(null);
      }
      
    } catch (error: any) {
      console.error('Error loading project data:', error);
    }
  };

  const runDeepAnalysis = async (voId: string, company: any, tenderData: any) => {
    try {
      setAnalyzing(true);
      toast.info('Running AI analysis...');

      const { data, error } = await supabase.functions.invoke('analyze-project', {
        body: {
          projectId: voId,
          companyId: company.id,
          tenderId: tenderData.id,
          members: teamMembers
        }
      });

      if (error) throw error;

      setAnalysis(data.analysis);
      setRecommendedPartners(data.recommendedPartners);
      
      toast.success('Analysis complete!');
    } catch (error: any) {
      console.error('Error running analysis:', error);
      toast.error('Failed to run analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddPartner = async (partnerId: string) => {
    if (!selectedProject) return;

    try {
      // Check if already a member
      const { data: existing } = await supabase
        .from('vo_members')
        .select('id')
        .eq('vo_id', selectedProject.id)
        .eq('company_id', partnerId)
        .maybeSingle();

      if (existing) {
        toast.error('Company is already a team member');
        return;
      }

      const { error } = await supabase
        .from('vo_members')
        .insert({
          vo_id: selectedProject.id,
          company_id: partnerId,
          role: 'invited'
        });

      if (error) throw error;

      await loadProjectData(selectedProject.id);
      toast.success('Partner added to team');
    } catch (error: any) {
      console.error('Error adding partner:', error);
      toast.error('Failed to add partner');
    }
  };

  const handleRemovePartner = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('vo_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      if (selectedProject) {
        await loadProjectData(selectedProject.id);
      }
      toast.success('Partner removed from team');
    } catch (error: any) {
      console.error('Error removing partner:', error);
      toast.error('Failed to remove partner');
    }
  };

  const handleRunGroupAnalysis = async () => {
    if (!selectedProject || !ownerCompany) return;
    
    if (!tender) {
      toast.error('Please select a tender for this project first');
      return;
    }
    
    await runDeepAnalysis(selectedProject.id, ownerCompany, tender);
  };

  const handleSendInvitations = async (selectedPartnerIds: string[]) => {
    try {
      toast.info('Sending invitations...');

      const { data, error } = await supabase.functions.invoke('send-project-invitations', {
        body: {
          projectId: selectedProject?.id,
          tenderTitle: tender?.title,
          partnerIds: selectedPartnerIds
        }
      });

      if (error) throw error;

      toast.success(`Sent ${selectedPartnerIds.length} invitation(s)`);
    } catch (error: any) {
      console.error('Error sending invitations:', error);
      toast.error('Failed to send invitations');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!tenderId && (!ownerCompany || projects.length === 0) && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold">Build Your Consulting Team</h1>
              <p className="text-muted-foreground mt-2">
                Create projects, analyze tenders, and form winning consortiums
              </p>
            </div>

            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Projects Yet</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  Start by creating a consulting project. You can link it to a tender and build your team.
                </p>
                <Button onClick={() => setCreateDialogOpen(true)} size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  Create Your First Project
                </Button>
              </CardContent>
            </Card>
          </div>

          {ownerCompany && (
            <ProjectCreationDialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
              onProjectCreated={handleProjectCreated}
              companyId={ownerCompany.id}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Build Your Consulting Team</h1>
              <p className="text-muted-foreground mt-2">
                Analyze requirements, find partners, and build winning consortiums
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-5 w-5 mr-2" />
              New Project
            </Button>
          </div>

          {/* Project Selector */}
          {!tenderId && projects.length > 1 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label htmlFor="project-select">Select Project:</Label>
                    <Select
                      value={selectedProject?.id || ""}
                      onValueChange={(value) => {
                        const project = projects.find(p => p.id === value);
                        setSelectedProject(project || null);
                      }}
                    >
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue placeholder="Select a project">
                          {selectedProject ? selectedProject.name : "Select a project"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name} {project.tenders && `- ${project.tenders.title}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            />
          )}

          <Separator />

          {/* Deep Analysis Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Target className="h-6 w-6" />
                  Deep Analysis
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  AI-powered competency gap analysis and partner recommendations
                </p>
              </div>
              <Button 
                onClick={handleRunGroupAnalysis}
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-run Analysis
                  </>
                )}
              </Button>
            </div>

            {analyzing && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Analyzing tender requirements and your company capabilities...
                  </p>
                </CardContent>
              </Card>
            )}

            {analysis && !analyzing && (
              <>
                <CoverageMap analysis={analysis} />
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
            onRunGroupAnalysis={handleRunGroupAnalysis}
            analyzing={analyzing}
          />

          <Separator />

          {/* Invitation Manager */}
          <InvitationManager 
            members={teamMembers}
            onSendInvitations={handleSendInvitations}
            projectTitle={tender?.title || selectedProject?.name}
          />
        </div>

        {/* Project Creation Dialog */}
        {ownerCompany && (
          <ProjectCreationDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onProjectCreated={handleProjectCreated}
            companyId={ownerCompany.id}
          />
        )}
      </div>
    </div>
  );
}
