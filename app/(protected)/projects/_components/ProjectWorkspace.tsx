"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectDetails } from "@/hooks/useProjectDetails";
import { useCompanyById } from "@/hooks/useProjectDetails";
import {
  useUpdateProjectStatus,
  useDeleteProject,
} from "@/hooks/useProjectMutations";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreVertical,
  Settings,
  BarChart3,
  Users,
  Target,
  Mail,
  CheckCircle,
  Archive,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

import { SetupPanel } from "./panels/SetupPanel";
import { GapAnalysisPanel } from "./panels/GapAnalysisPanel";
import { TeamBuilderPanel } from "./panels/TeamBuilderPanel";
import { TeamAnalysisPanel } from "./panels/TeamAnalysisPanel";
import { InvitationsPanel } from "./panels/InvitationsPanel";
import { TeamContactsCard } from "@/components/consulting/TeamContactsCard";
import { WorkspaceSkeleton } from "./skeletons/WorkspaceSkeleton";

interface ProjectWorkspaceProps {
  projectId: string | null;
}

export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const [openPanels, setOpenPanels] = useState<string[]>(["setup"]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const {
    data: details,
    isLoading,
    isFetching,
    error,
  } = useProjectDetails(projectId);

  const { data: leadCompany } = useCompanyById(
    details?.project.lead_company_id ?? null,
  );

  const updateStatus = useUpdateProjectStatus();
  const deleteProject = useDeleteProject();

  // Empty state
  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium mb-2">No Project Selected</h3>
          <p className="text-muted-foreground">
            Select a project from the list or create a new one to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <WorkspaceSkeleton />;
  }

  if (error || !details) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Failed to load project details</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error?.message || "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    project,
    tender,
    teamMembers,
    gapAnalysis,
    teamAnalysis,
    recommendedPartners,
    tenderMatchResult,
    isOwner,
  } = details;

  const handleStatusChange = async (status: string) => {
    try {
      await updateStatus.mutateAsync({ projectId: project.id, status });
      toast.success(`Project marked as ${status}`);
    } catch {
      toast.error("Failed to update project status");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync({ projectId: project.id });
      toast.success("Project deleted");
      setDeleteDialogOpen(false);
    } catch {
      toast.error("Failed to delete project");
    }
  };

  const getStatusBadge = () => {
    switch (project.status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "completed":
        return (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600">
            Completed
          </Badge>
        );
      case "archived":
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{project.status}</Badge>;
    }
  };

  // Calculate summary stats for accordion headers
  // Solo: show gap analysis coverage if run, else tender match; with partners: gap analysis coverage
  const gapScore =
    teamMembers.length <= 1
      ? (gapAnalysis?.coveragePercentage ?? tenderMatchResult?.overall_score)
      : gapAnalysis?.coveragePercentage;
  const teamScore = teamAnalysis?.coveragePercentage;
  const teamCount = teamMembers.length;
  const invitableCount = teamMembers.filter(
    (m) => m.role === "invited" || m.role === "member",
  ).length;

  return (
    <>
      <Card className={isFetching ? "opacity-60 transition-opacity" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {project.name}
                {getStatusBadge()}
              </CardTitle>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {project.description}
                </p>
              )}
            </div>

            {isOwner ? (
              <div className="flex items-center gap-2">
                {project.status !== "completed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange("completed")}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Project
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {project.status !== "archived" && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange("archived")}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive Project
                      </DropdownMenuItem>
                    )}
                    {(project.status === "completed" ||
                      project.status === "archived") && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange("active")}
                      >
                        <Target className="h-4 w-4 mr-2" />
                        Reactivate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteDialogOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-600 border-blue-200"
              >
                Member
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <Accordion
            type="multiple"
            value={openPanels}
            onValueChange={setOpenPanels}
            className="space-y-2"
          >
            {/* Setup Panel */}
            <AccordionItem value="setup" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>Setup</span>
                </div>
                {tender && (
                  <Badge variant="outline" className="ml-auto mr-2">
                    {tender.title.length > 30
                      ? tender.title.slice(0, 30) + "..."
                      : tender.title}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <SetupPanel project={project} tender={tender} />
                  </motion.div>
                </AnimatePresence>
              </AccordionContent>
            </AccordionItem>

            {/* Gap Analysis Panel */}
            <AccordionItem
              value="gap-analysis"
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span>Gap Analysis</span>
                </div>
                {gapScore !== undefined && gapScore !== null ? (
                  <Badge
                    variant={
                      Math.round(gapScore) >= 70 ? "default" : "secondary"
                    }
                    className="ml-auto mr-2"
                  >
                    {Math.round(gapScore)}% coverage
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto mr-2">
                    Not analyzed
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <GapAnalysisPanel
                      projectId={project.id}
                      tender={tender}
                      company={(leadCompany as unknown as Company) ?? null}
                      teamMembers={teamMembers}
                      gapAnalysis={gapAnalysis}
                      recommendedPartners={recommendedPartners}
                      tenderMatchResult={tenderMatchResult}
                    />
                  </motion.div>
                </AnimatePresence>
              </AccordionContent>
            </AccordionItem>

            {/* Team Builder Panel (owner only) */}
            {isOwner && (
              <AccordionItem
                value="team-builder"
                className="border rounded-lg px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Team Builder</span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto mr-2">
                    {tender && (
                      <Badge
                        variant="secondary"
                        className="font-normal max-w-[180px] truncate"
                        title={tender.title}
                      >
                        {tender.title.length > 25
                          ? tender.title.slice(0, 25) + "…"
                          : tender.title}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {teamCount} {teamCount === 1 ? "member" : "members"}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <AnimatePresence mode="wait">
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <TeamBuilderPanel
                        projectId={project.id}
                        teamMembers={teamMembers}
                        recommendedPartners={recommendedPartners}
                      />
                    </motion.div>
                  </AnimatePresence>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Team Analysis Panel */}
            <AccordionItem
              value="team-analysis"
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span>Team Analysis</span>
                </div>
                {teamScore !== undefined ? (
                  <Badge
                    variant={
                      Math.round(teamScore) >= 85 ? "default" : "secondary"
                    }
                    className="ml-auto mr-2"
                  >
                    {Math.round(teamScore)}% ready
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-auto mr-2">
                    Not analyzed
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <TeamAnalysisPanel
                      projectId={project.id}
                      tender={tender}
                      company={(leadCompany as unknown as Company) ?? null}
                      teamMembers={teamMembers}
                      teamAnalysis={teamAnalysis}
                    />
                  </motion.div>
                </AnimatePresence>
              </AccordionContent>
            </AccordionItem>

            {/* Invitations Panel (owner only) */}
            {isOwner && (
              <AccordionItem
                value="invitations"
                className="border rounded-lg px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>Invitations</span>
                  </div>
                  {invitableCount > 0 ? (
                    <Badge variant="outline" className="ml-auto mr-2">
                      {invitableCount} to invite
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto mr-2">
                      No partners yet
                    </Badge>
                  )}
                </AccordionTrigger>
                <AccordionContent>
                  <AnimatePresence mode="wait">
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <InvitationsPanel
                        projectId={project.id}
                        projectName={project.name}
                        teamMembers={teamMembers}
                        tenderTitle={tender?.title}
                      />
                    </motion.div>
                  </AnimatePresence>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          {/* Team contacts for member users */}
          {!isOwner && (
            <div className="mt-4">
              <TeamContactsCard teamMembers={teamMembers} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{project.name}&quot;? This
              action cannot be undone and will remove all team members and
              analysis data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
