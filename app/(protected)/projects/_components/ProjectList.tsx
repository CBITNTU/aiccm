"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useProjects,
  type ProjectStatus,
  type Project,
} from "@/hooks/useProjects";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase,
  FolderOpen,
  Archive,
  CheckCircle2,
  Target,
  Users,
} from "lucide-react";
import { ProjectListSkeleton } from "./skeletons/ProjectListSkeleton";
import { deriveCoverage } from "@/lib/utils";

interface ProjectListProps {
  companyId: string | null;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  filter: ProjectStatus;
  onFilterChange: (filter: ProjectStatus) => void;
}

export function ProjectList({
  companyId,
  selectedProjectId,
  onSelectProject,
  filter,
  onFilterChange,
}: ProjectListProps) {
  const {
    data: projects,
    isLoading,
    isFetching,
    error,
  } = useProjects(companyId, filter);

  // Auto-select first project when list loads or changes
  useEffect(() => {
    if (projects && projects.length > 0 && !selectedProjectId && !isFetching) {
      onSelectProject(projects[0].id);
    }
  }, [projects, selectedProjectId, onSelectProject, isFetching]);

  // Clear selection if selected project no longer in list
  // Skip while fetching - the project might be coming in the new data
  useEffect(() => {
    if (
      selectedProjectId &&
      projects &&
      !isFetching &&
      !projects.find((p) => p.id === selectedProjectId)
    ) {
      onSelectProject(projects.length > 0 ? projects[0].id : null);
    }
  }, [projects, selectedProjectId, onSelectProject, isFetching]);

  if (isLoading) {
    return <ProjectListSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Failed to load projects</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={isFetching ? "opacity-60 transition-opacity" : ""}>
        <CardHeader className="pb-3">
          <Tabs
            value={filter}
            onValueChange={(v) => onFilterChange(v as ProjectStatus)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active" className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Active
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </TabsTrigger>
              <TabsTrigger
                value="archived"
                className="flex items-center gap-1.5"
              >
                <Archive className="h-3.5 w-3.5" />
                Archived
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-2">
          <AnimatePresence mode="popLayout">
            {projects && projects.length > 0 ? (
              projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ProjectCard
                    project={project}
                    isSelected={project.id === selectedProjectId}
                    onClick={() => onSelectProject(project.id)}
                  />
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-8 text-center"
              >
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  No {filter} projects found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create a new project to get started
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </>
  );
}

// Individual project card component
interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
}

function ProjectCard({ project, isSelected, onClick }: ProjectCardProps) {
  const statusBadge = () => {
    switch (project.status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "completed":
        return <Badge variant="secondary">Completed</Badge>;
      case "archived":
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{project.status}</Badge>;
    }
  };

  const gapCoverage = project.gap_analysis
    ? deriveCoverage(
        project.gap_analysis.companyCompetencies ?? [],
        project.gap_analysis.missingCompetencies ?? [],
        project.gap_analysis.coveragePercentage,
      )
    : undefined;
  const teamCoverage = project.team_analysis?.coveragePercentage;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`
        p-4 rounded-lg border cursor-pointer transition-colors
        ${
          isSelected
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium truncate flex-1 pr-2">{project.name}</h3>
        <div className="flex items-center gap-1.5">
          {project.userRole === "member" && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
              Member
            </Badge>
          )}
          {statusBadge()}
        </div>
      </div>

      {project.tenders && (
        <p className="text-sm text-muted-foreground truncate mb-2">
          <Target className="h-3 w-3 inline mr-1" />
          {project.tenders.title}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {gapCoverage !== undefined && (
          <Badge variant="outline" className="text-xs">
            {Math.round(gapCoverage)}% coverage
          </Badge>
        )}
        {teamCoverage !== undefined && teamCoverage !== gapCoverage && (
          <Badge variant="outline" className="text-xs bg-green-500/10">
            <Users className="h-3 w-3 mr-1" />
            {Math.round(teamCoverage)}% team
          </Badge>
        )}
      </div>
    </motion.div>
  );
}
