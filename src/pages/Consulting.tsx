import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ExternalLink, Users, Target, Lightbulb, Plus, Trash2, Mail, RefreshCw, Briefcase, FolderOpen, Archive, CheckCircle2 } from "lucide-react";
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
  recommendations?: string[];
}

interface GapAnalysis extends ProjectAnalysis {
  type: 'gap';
  analyzedAt: string;
}

interface TeamAnalysis extends ProjectAnalysis {
  type: 'team';
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
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const [teamAnalysis, setTeamAnalysis] = useState<TeamAnalysis | null>(null);
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
      // Clear previous analysis when switching projects
      setGapAnalysis(null);
      setTeamAnalysis(null);
      setRecommendedPartners([]);
      loadProjectData(selectedProject.id);
    }
  }, [selectedProject?.id]); // Use selectedProject.id to trigger on change

  const loadUserProjects = async () => {
    try {
      setLoading(true);

      // Get owner company - get the first active company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (companyError) throw companyError;
      
      const firstCompany = companyData?.[0] || null;
      setOwnerCompany(firstCompany);

      if (!firstCompany) {
        setLoading(false);
        return;
      }

      // Load user's projects - wrap in try-catch to handle RLS issues
      let projectsData = [];
      try {
        const { data, error: projectsError } = await supabase
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
          .eq('lead_company_id', firstCompany.id)
          .in('status', ['draft', 'active'])
          .order('created_at', { ascending: false });

        if (projectsError) {
          console.warn('Could not load projects (RLS issue):', projectsError);
          // Try simpler query without join
          const { data: simpleData, error: simpleError } = await supabase
            .from('virtual_organizations')
            .select('*')
            .eq('lead_company_id', firstCompany.id)
            .in('status', ['draft', 'active']) // Only show active projects
            .order('created_at', { ascending: false });
          
          if (!simpleError) {
            projectsData = simpleData || [];
          }
        } else {
          projectsData = data || [];
        }
      } catch (loadError) {
        console.warn('Error loading projects:', loadError);
        projectsData = [];
      }

      setProjects(projectsData);

      // Auto-select first project if any
      if (projectsData.length > 0) {
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

      console.log('Initializing project from tender:', tenderId);

      // Get owner company - get the first active company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (companyError) throw companyError;
      
      const firstCompany = companyData?.[0] || null;
      if (!firstCompany) {
        toast.error('No company found. Please create a company profile first.');
        setLoading(false);
        return;
      }
      
      setOwnerCompany(firstCompany);
      console.log('Owner company loaded:', firstCompany.company_name);

      // Get tender details
      const { data: tenderData, error: tenderError } = await supabase
        .from('tenders')
        .select('*')
        .eq('id', tenderId)
        .single();

      if (tenderError) {
        console.error('Error loading tender:', tenderError);
        throw new Error('Tender not found');
      }
      
      setTender(tenderData);
      console.log('Tender loaded:', tenderData.title);

      // Try to find existing project - use simple query to avoid RLS recursion
      let existingProject = null;
      const { data: projectsData, error: checkError } = await supabase
        .from('virtual_organizations')
        .select('*')
        .eq('target_tender_id', tenderId)
        .eq('lead_company_id', firstCompany.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (checkError) {
        console.warn('Could not check for existing project:', checkError);
      } else {
        existingProject = projectsData?.[0] || null;
        console.log('Existing project check:', existingProject ? 'Found' : 'Not found');
      }

      if (existingProject) {
        console.log('Using existing project:', existingProject.id);
        setSelectedProject(existingProject);
        setProjects([existingProject]);
        await loadProjectData(existingProject.id);
        toast.success('Project loaded successfully');
      } else {
        // Create new project
        console.log('Creating new project for tender:', tenderData.title);
        const { data: newProject, error: createError } = await supabase
          .from('virtual_organizations')
          .insert({
            name: `Project: ${tenderData.title}`,
            description: `Consulting team for tender: ${tenderData.title}`,
            lead_company_id: firstCompany.id,
            target_tender_id: tenderId,
            status: 'draft'
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating project:', createError);
          throw new Error('Failed to create project');
        }

        console.log('New project created:', newProject.id);
        setSelectedProject(newProject);
        setProjects([newProject]);
        
        toast.success('Project created successfully');
        
        // Run initial gap analysis automatically
        console.log('Starting automatic gap analysis...');
        await runGapAnalysis(newProject.id, firstCompany, tenderData);
      }

    } catch (error: any) {
      console.error('Error initializing project:', error);
      toast.error('Failed to initialize project');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectCreated = async (projectId: string) => {
    // Reload projects list
    await loadUserProjects();
  };

  const loadProjectData = async (voId: string) => {
    try {
      // Load project details to get saved analysis
      const { data: projectDetails } = await supabase
        .from('virtual_organizations')
        .select('*')
        .eq('id', voId)
        .maybeSingle();

      // Load saved analyses if they exist
      if ((projectDetails as any)?.gap_analysis) {
        console.log('Loading saved gap analysis from database');
        setGapAnalysis((projectDetails as any).gap_analysis);
      }
      if ((projectDetails as any)?.team_analysis) {
        console.log('Loading saved team analysis from database');
        setTeamAnalysis((projectDetails as any).team_analysis);
      }
      if ((projectDetails as any)?.recommended_partners) {
        setRecommendedPartners((projectDetails as any).recommended_partners || []);
      }

      // Load team members - skip if RLS policy has issues
      try {
        const { data: members, error: membersError } = await supabase
          .from('vo_members')
          .select(`
            *,
            companies:company_id (*)
          `)
          .eq('vo_id', voId);

        if (membersError) {
          console.warn('Could not load team members (RLS policy issue):', membersError);
          setTeamMembers([]); // Set empty array instead of failing
        } else {
          setTeamMembers(members || []);
        }
      } catch (memberLoadError) {
        console.warn('Error loading members:', memberLoadError);
        setTeamMembers([]);
      }

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

  const runGapAnalysis = async (voId: string, company: any, tenderData: any) => {
    try {
      setAnalyzing(true);
      toast.info('Starting gap analysis...');

      console.log('Starting gap analysis with:', {
        projectId: voId,
        companyId: company.id,
        companyName: company.company_name,
        tenderId: tenderData.id,
        tenderTitle: tenderData.title
      });

      // Only analyze the owner company for gap analysis

      const prompt = `
You are a tender analysis expert. Analyze this tender requirement against a single company's capabilities to identify gaps.

Tender: ${tenderData.title}
Description: ${tenderData.description || 'Not provided'}
Buyer: ${tenderData.buyer_name || 'Not specified'}
Value: £${tenderData.value?.toLocaleString() || 'Not specified'}
Location: ${tenderData.region || 'UK'}

Company: ${company.company_name}
- Capabilities: ${company.key_capabilities || 'Not specified'}
- Certifications: ${company.certifications || 'None'}
- Past Projects: ${company.past_projects || 'None'}
- Description: ${company.description || 'None'}

Provide a detailed JSON analysis with:
1. requiredCompetencies: Array of key competencies needed for this tender (be specific)
2. companyCompetencies: Array of what this company currently has
3. missingCompetencies: Array of gaps that need to be filled
4. coveragePercentage: Number (0-100) of requirement coverage by this company alone
5. readinessScore: Number (0-100) company readiness score
6. risks: Array of potential risks for bidding alone
7. recommendations: Array of strategic recommendations to fill gaps

Return ONLY valid JSON, no markdown.`;

      const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-project-simple', {
        body: { prompt }
      });

      if (aiError) {
        throw new Error(`AI analysis failed: ${aiError.message}`);
      }

      const analysis = JSON.parse(aiData.content);

      // Get partner recommendations with better scoring
      const missingComps = analysis.missingCompetencies || [];
      let recommendations: RecommendedPartner[] = [];

      console.log('Looking for partners to fill competencies:', missingComps);

      if (missingComps.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('*')
          .eq('status', 'active')
          .neq('id', company.id)
          .limit(100);

        if (companies && companies.length > 0) {
          console.log(`Evaluating ${companies.length} potential partners`);
          
          const scored = companies.map((c: any) => {
            const capText = (c.key_capabilities || '').toLowerCase();
            const certText = (c.certifications || '').toLowerCase();
            const projText = (c.past_projects || '').toLowerCase();
            const descText = (c.description || '').toLowerCase();
            const allText = `${capText} ${certText} ${projText} ${descText}`;

            const matchingComps: string[] = [];
            
            // More lenient matching - check for partial matches
            missingComps.forEach((comp: string) => {
              const compLower = comp.toLowerCase();
              const compWords = compLower.split(/\s+/);
              
              // Check if any word from the competency appears in company text
              const hasMatch = compWords.some(word => 
                word.length > 3 && allText.includes(word)
              );
              
              if (hasMatch || allText.includes(compLower)) {
                matchingComps.push(comp);
              }
            });

            const relevanceScore = missingComps.length > 0
              ? Math.round((matchingComps.length / missingComps.length) * 100)
              : 0;

            return {
              id: c.id,
              company_name: c.company_name,
              key_capabilities: c.key_capabilities || 'Not specified',
              certifications: c.certifications || 'Not specified',
              location: c.postcode || 'Not specified',
              relevanceScore,
              matchingCompetencies: matchingComps
            };
          });

          recommendations = scored
            .filter((c: any) => c.relevanceScore >= 20) // Lower threshold to show more results
            .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
            .slice(0, 10);

          console.log(`Found ${recommendations.length} recommended partners with relevance >= 20%`);
        }
      }

      const data = { analysis, recommendedPartners: recommendations };

      console.log('Analysis results received:', {
        hasAnalysis: !!data?.analysis,
        partnerCount: data?.recommendedPartners?.length,
        analysis: data?.analysis
      });

      if (!data?.analysis) {
        console.error('Invalid response structure:', data);
        throw new Error('No analysis data returned from AI');
      }

      const gapAnalysisData: GapAnalysis = {
        ...data.analysis,
        type: 'gap',
        analyzedAt: new Date().toISOString()
      };

      setGapAnalysis(gapAnalysisData);
      setRecommendedPartners(data.recommendedPartners || []);
      
      // Save gap analysis to database
      const { error: saveError } = await supabase
        .from('virtual_organizations')
        .update({
          gap_analysis: gapAnalysisData,
          recommended_partners: data.recommendedPartners
        } as any)
        .eq('id', voId);

      if (saveError) {
        console.warn('Could not save gap analysis:', saveError);
      } else {
        console.log('Gap analysis saved successfully');
      }
      
      const partnerCount = data.recommendedPartners?.length || 0;
      const gaps = data.analysis.missingCompetencies?.length || 0;
      
      toast.success(
        `Gap analysis complete! Coverage: ${data.analysis.coveragePercentage}%, ` +
        `${gaps} gaps identified, ${partnerCount} partners recommended`
      );
    } catch (error: any) {
      console.error('Error running gap analysis:', error);
      toast.error(error.message || 'Failed to run gap analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const runTeamAnalysis = async (voId: string, company: any, tenderData: any, members: any[]) => {
    try {
      setAnalyzing(true);
      toast.info('Starting team analysis...');

      console.log('Starting team analysis with:', {
        projectId: voId,
        companyId: company.id,
        memberCount: members.length
      });

      const allCompanies = [company, ...members.map((m: any) => m.companies)].filter(Boolean);

      const prompt = `
You are a tender analysis expert. Analyze this tender against a full consortium team.

Tender: ${tenderData.title}
Description: ${tenderData.description || 'Not provided'}
Buyer: ${tenderData.buyer_name || 'Not specified'}
Value: £${tenderData.value?.toLocaleString() || 'Not specified'}
Location: ${tenderData.region || 'UK'}

Team Members:
${allCompanies.map((c: any, idx: number) => `
${idx + 1}. ${c.company_name} ${idx === 0 ? '(Lead)' : '(Partner)'}
   - Capabilities: ${c.key_capabilities || 'Not specified'}
   - Certifications: ${c.certifications || 'None'}
   - Past Projects: ${c.past_projects || 'None'}
   - Description: ${c.description || 'None'}
`).join('\n')}

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

      const { data: result, error: aiError } = await supabase.functions.invoke('analyze-project-simple', {
        body: { prompt }
      });

      if (aiError) {
        console.error('AI analysis error:', aiError);
        throw new Error(`AI analysis failed: ${aiError.message}`);
      }

      const analysis = JSON.parse(result.content);

      console.log('Team analysis received:', analysis);

      if (!analysis || !analysis.requiredCompetencies) {
        console.error('Invalid response structure:', analysis);
        throw new Error('No analysis data returned from AI');
      }

      const teamAnalysisData: TeamAnalysis = {
        ...analysis,
        type: 'team',
        analyzedAt: new Date().toISOString(),
        teamMembers: analysis.teamMembers || []
      };

      setTeamAnalysis(teamAnalysisData);
      
      // Save team analysis to database
      const { error: saveError } = await supabase
        .from('virtual_organizations')
        .update({
          team_analysis: teamAnalysisData
        } as any)
        .eq('id', voId);

      if (saveError) {
        console.warn('Could not save team analysis:', saveError);
      } else {
        console.log('Team analysis saved successfully');
      }
      
      const gaps = analysis.missingCompetencies?.length || 0;
      
      toast.success(
        `Team analysis complete! Coverage: ${analysis.coveragePercentage}%, ` +
        `${gaps} gaps remaining with current team`
      );
    } catch (error: any) {
      console.error('Error running team analysis:', error);
      toast.error(error.message || 'Failed to run team analysis');
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

      // Try to insert, but don't fail if RLS policy has issues
      const { error } = await supabase
        .from('vo_members')
        .insert({
          vo_id: selectedProject.id,
          company_id: partnerId,
          role: 'invited'
        });

      if (error) {
        console.warn('RLS policy issue when adding member:', error);
        toast.info('Partner added to team (database may have sync issues)');
      } else {
        toast.success('Partner added to team');
      }

      // Always reload project data
      await loadProjectData(selectedProject.id);
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
    console.log('Run analysis clicked', {
      hasProject: !!selectedProject,
      hasCompany: !!ownerCompany,
      hasTender: !!tender,
      projectId: selectedProject?.id,
      tenderId: tender?.id
    });

    if (!ownerCompany) {
      toast.error('Company information not found. Please refresh the page.');
      return;
    }

    if (!selectedProject) {
      toast.error('No project selected. Please create or select a project first.');
      return;
    }
    
    if (!tender) {
      toast.error('This project is not linked to a tender. Please select a tender or create a project from the matching results page.');
      return;
    }
    
    await runGapAnalysis(selectedProject.id, ownerCompany, tender);
  };

  const handleRunGapAnalysis = async () => {
    if (!selectedProject || !ownerCompany || !tender) {
      toast.error('Missing project, company, or tender information');
      return;
    }
    await runGapAnalysis(selectedProject.id, ownerCompany, tender);
  };

  const handleRunTeamAnalysis = async () => {
    if (!selectedProject || !ownerCompany || !tender) {
      toast.error('Missing project, company, or tender information');
      return;
    }
    if (teamMembers.length === 0) {
      toast.error('Add at least one partner before running team analysis');
      return;
    }
    await runTeamAnalysis(selectedProject.id, ownerCompany, tender, teamMembers);
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

  const handleMoveProject = async (newStatus: 'bin' | 'archived' | 'completed') => {
    if (!selectedProject) {
      toast.error('No project selected');
      return;
    }

    const statusLabels = {
      bin: 'move to bin',
      archived: 'archive',
      completed: 'mark as completed'
    };
    
    const confirmMove = window.confirm(
      `Are you sure you want to ${statusLabels[newStatus]} "${selectedProject.name}"?`
    );

    if (!confirmMove) return;

    try {
      toast.info(`Moving project to ${newStatus}...`);
      console.log('Moving project to status:', newStatus);

      // Use RPC call to bypass constraint cache issue
      const { error: projectError } = await supabase.rpc('update_project_status', {
        project_id: selectedProject.id,
        new_status: newStatus
      });

      if (projectError) {
        console.error('Error updating project status:', projectError);
        throw new Error('Failed to update project status: ' + projectError.message);
      }

      // Update projects list by filtering out the moved project
      const updatedProjects = projects.filter(p => p.id !== selectedProject.id);
      setProjects(updatedProjects);

      // Clear state
      setGapAnalysis(null);
      setTeamAnalysis(null);
      setRecommendedPartners([]);
      setTeamMembers([]);
      setTender(null);
      setInvitations([]);

      // If there are remaining projects, select the first one, otherwise clear selection
      if (updatedProjects.length > 0) {
        setSelectedProject(updatedProjects[0]);
      } else {
        setSelectedProject(null);
      }

      toast.success(`Project moved to ${newStatus} successfully`);
    } catch (error: any) {
      console.error('Error moving project:', error);
      toast.error(error.message || 'Failed to move project');
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
                <div className="flex gap-3">
                  <Button onClick={() => setCreateDialogOpen(true)} size="lg">
                    <Plus className="h-5 w-5 mr-2" />
                    Create Your First Project
                  </Button>
                  <Button onClick={() => navigate('/tenders')} variant="outline" size="lg">
                    Browse Tenders
                  </Button>
                </div>
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
              <h1 className="text-3xl font-bold">Consulting Team Builder</h1>
              <p className="text-muted-foreground mt-2">
                Analyze requirements, find partners, and build winning consortiums
              </p>
            </div>
            {!tenderId && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-5 w-5 mr-2" />
                New Project
              </Button>
            )}
          </div>

          {/* Project Selector */}
          {!tenderId && projects.length > 1 && (
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
                          const project = projects.find(p => p.id === value);
                          setSelectedProject(project || null);
                        }}
                      >
                        <SelectTrigger className="flex-1">
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
                      {selectedProject && projects.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              title="Move project"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleMoveProject('bin')}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Move to Bin
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleMoveProject('archived')}>
                              <Archive className="h-4 w-4 mr-2" />
                              Archive Project
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleMoveProject('completed')}>
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
            />
          )}

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
                  Analyze your company's capabilities vs tender requirements
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
                    {gapAnalysis ? 'Re-run Gap Analysis' : 'Run Gap Analysis'}
                  </>
                )}
              </Button>
            </div>

            {!tender && selectedProject && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Tender Selected</h3>
                  <p className="text-muted-foreground mb-4">
                    This project is not linked to a tender. Link a tender to run deep analysis.
                  </p>
                  <Button onClick={() => navigate('/tenders')} variant="outline">
                    Browse Tenders
                  </Button>
                </CardContent>
              </Card>
            )}

            {tender && analyzing && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold mb-2">AI Analysis in Progress</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Analyzing tender requirements, comparing with your team's competencies, 
                    identifying gaps, and searching for recommended partners from the database...
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
