"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { deriveCoverage } from "@/lib/utils";
import type {
  GapAnalysis,
  TeamAnalysis,
  RecommendedPartner,
} from "./useProjects";

interface CreateProjectInput {
  name: string;
  description?: string;
  targetTenderId?: string | null;
  leadCompanyId: string;
}

interface CompanyLike {
  id: string;
  companyName: string;
  keyCapabilities?: string | null;
  certifications?: string | null;
  pastProjects?: string | null;
  description?: string | null;
  postcode?: string | null;
}

interface Tender {
  title: string;
  description?: string;
  buyerName?: string;
  value?: number;
  region?: string;
}

interface TeamMember {
  companies?: {
    companyName: string;
    keyCapabilities?: string | null;
    certifications?: string | null;
    pastProjects?: string | null;
    description?: string | null;
  } | null;
}

// Create project mutation
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const result = await api.createProject({
        name: input.name,
        description: input.description,
        targetTenderId: input.targetTenderId,
        companyId: input.leadCompanyId,
      });
      return result.project as Record<string, unknown>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", variables.leadCompanyId],
      });
    },
  });
}

// Add team member mutation
export function useAddTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      companyId,
    }: {
      projectId: string;
      companyId: string;
    }) => {
      const result = await api.addProjectMember(projectId, companyId);
      return result.member;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
    },
  });
}

// Remove team member mutation
export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      projectId,
    }: {
      memberId: string;
      projectId: string;
    }) => {
      await api.removeProjectMember(projectId, memberId);
      return { memberId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
    },
  });
}

// Run gap analysis mutation
export function useRunGapAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      company,
      tenderId,
    }: {
      projectId: string;
      company: CompanyLike;
      tenderId: string;
    }) => {
      // Call server-side API which handles prompt construction and AI call
      const aiData = await api.analyzeProjectSimple({
        projectId,
        companyId: company.id,
        tenderId,
      });
      const analysis = aiData.analysis;

      // Get partner recommendations based on missing competencies
      const missingComps = analysis.missingCompetencies || [];
      let recommendations: RecommendedPartner[] = [];

      if (missingComps.length > 0) {
        // Fetch active companies from directory for partner matching
        const dirData = await api.getDirectory({ limit: 100 });
        const companies = (dirData.companies || []) as unknown as CompanyLike[];

        if (companies.length > 0) {
          const scored = companies
            .filter((c) => c.id !== company.id)
            .map((c) => {
              const capText = (c.keyCapabilities || "").toLowerCase();
              const certText = (c.certifications || "").toLowerCase();
              const projText = (c.pastProjects || "").toLowerCase();
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
                  ? Math.round(
                      (matchingComps.length / missingComps.length) * 100,
                    )
                  : 0;

              return {
                id: c.id,
                companyName: c.companyName,
                keyCapabilities: c.keyCapabilities || "Not specified",
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

      const compComps = analysis.companyCompetencies || [];
      const missComps = analysis.missingCompetencies || [];
      const derivedCoverage = deriveCoverage(
        compComps,
        missComps,
        Math.round(analysis.coveragePercentage ?? 0),
      );

      const gapAnalysisData: GapAnalysis = {
        ...analysis,
        companyCompetencies: compComps,
        missingCompetencies: missComps,
        coveragePercentage: derivedCoverage,
        readinessScore: Math.round(analysis.readinessScore ?? 0),
        type: "gap",
        analyzedAt: new Date().toISOString(),
      };

      // Save gap analysis to database via API
      await api.updateProject(projectId, {
        gapAnalysis: gapAnalysisData,
        recommendedPartners: recommendations,
      });

      return {
        gapAnalysis: gapAnalysisData,
        recommendedPartners: recommendations,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
    },
  });
}

// Run team analysis mutation
export function useRunTeamAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      company,
      tender,
      teamMembers,
    }: {
      projectId: string;
      company: CompanyLike;
      tender: Tender;
      teamMembers: TeamMember[];
    }) => {
      const result = await api.analyzeTeam({
        projectId,
        company: {
          id: company.id,
          companyName: company.companyName,
          keyCapabilities: company.keyCapabilities,
          certifications: company.certifications,
          pastProjects: company.pastProjects,
          description: company.description,
        },
        tender,
        teamMembers,
      });

      return { teamAnalysis: result.teamAnalysis as TeamAnalysis };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
    },
  });
}

// Update gap analysis (human overrides: move competencies <-> missing)
export function useUpdateGapAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      companyCompetencies,
      missingCompetencies,
    }: {
      projectId: string;
      companyCompetencies: string[];
      missingCompetencies: string[];
    }) => {
      const coveragePercentage = deriveCoverage(companyCompetencies, missingCompetencies);

      // Fetch current gap_analysis to merge
      const details = await api.getProjectDetails(projectId);
      const existing =
        (details.project.gapAnalysis as Record<string, unknown>) || {};
      const updated: Record<string, unknown> = {
        ...existing,
        companyCompetencies,
        missingCompetencies,
        coveragePercentage,
      };

      await api.updateProject(projectId, { gapAnalysis: updated });

      return { projectId, gapAnalysis: updated };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Update team analysis (human overrides: move competencies <-> missing)
export function useUpdateTeamAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      companyCompetencies,
      missingCompetencies,
    }: {
      projectId: string;
      companyCompetencies: string[];
      missingCompetencies: string[];
    }) => {
      const coveragePercentage = deriveCoverage(companyCompetencies, missingCompetencies);

      // Fetch current team_analysis to merge
      const details = await api.getProjectDetails(projectId);
      const existing =
        (details.project.teamAnalysis as Record<string, unknown>) || {};
      const updated: Record<string, unknown> = {
        ...existing,
        companyCompetencies,
        missingCompetencies,
        coveragePercentage,
      };

      await api.updateProject(projectId, { teamAnalysis: updated });

      return { projectId, teamAnalysis: updated };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Update project status mutation
export function useUpdateProjectStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      status,
    }: {
      projectId: string;
      status: string;
    }) => {
      await api.updateProject(projectId, { status });
      return { projectId, status };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectDetails"] });
    },
  });
}

// Delete project mutation
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      await api.deleteProject(projectId);
      return { projectId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Send invitations mutation
export function useSendInvitations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      tenderTitle,
      partnerIds,
    }: {
      projectId: string;
      tenderTitle: string;
      partnerIds: string[];
    }) => {
      return await api.sendProjectInvitations(
        projectId,
        tenderTitle,
        partnerIds,
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Update project tender mutation
export function useUpdateProjectTender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      tenderId,
    }: {
      projectId: string;
      tenderId: string | null;
    }) => {
      await api.updateProject(projectId, {
        targetTenderId: tenderId,
        // Clear analysis when tender changes since it's no longer valid
        gapAnalysis: null,
        teamAnalysis: null,
        recommendedPartners: null,
      });
      return { projectId, tenderId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projectDetails", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
