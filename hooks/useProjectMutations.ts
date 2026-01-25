"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api/client";
import type { Database } from "@/lib/supabase/types";
import type { GapAnalysis, TeamAnalysis, RecommendedPartner } from "./useProjects";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface CreateProjectInput {
  name: string;
  description?: string;
  target_tender_id?: string | null;
  lead_company_id: string;
}

interface Tender {
  title: string;
  description?: string;
  buyer_name?: string;
  value?: number;
  region?: string;
}

interface TeamMember {
  companies?: {
    company_name: string;
    key_capabilities?: string | null;
    certifications?: string | null;
    past_projects?: string | null;
    description?: string | null;
  } | null;
}

// Create project mutation
export function useCreateProject() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const { data, error } = await supabase
        .from("virtual_organizations")
        .insert({
          name: input.name,
          description: input.description || null,
          lead_company_id: input.lead_company_id,
          target_tender_id: input.target_tender_id || null,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate projects list
      queryClient.invalidateQueries({
        queryKey: ["projects", variables.lead_company_id],
      });
    },
  });
}

// Add team member mutation
export function useAddTeamMember() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      companyId,
    }: {
      projectId: string;
      companyId: string;
    }) => {
      const { data, error } = await supabase
        .from("vo_members")
        .insert({
          vo_id: projectId,
          company_id: companyId,
          role: "invited",
        })
        .select(
          `
          *,
          companies:company_id (*)
        `
        )
        .single();

      if (error) throw new Error(error.message);
      return data;
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
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      projectId: _projectId,
    }: {
      memberId: string;
      projectId: string;
    }) => {
      // projectId is passed through variables for cache invalidation in onSuccess
      void _projectId;
      const { error } = await supabase
        .from("vo_members")
        .delete()
        .eq("id", memberId);

      if (error) throw new Error(error.message);
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
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      company,
      tender,
    }: {
      projectId: string;
      company: Company;
      tender: Tender;
    }) => {
      const prompt = `
You are a tender analysis expert. Analyze this tender requirement against a single company's capabilities to identify gaps.

Tender: ${tender.title}
Description: ${tender.description || "Not provided"}
Buyer: ${tender.buyer_name || "Not specified"}
Value: £${tender.value?.toLocaleString() || "Not specified"}
Location: ${tender.region || "UK"}

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
                (word: string) => word.length > 3 && allText.includes(word)
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

      // Save gap analysis to database
      const { error } = await supabase
        .from("virtual_organizations")
        .update({
          gap_analysis: gapAnalysisData as unknown as Database["public"]["Tables"]["virtual_organizations"]["Update"]["gap_analysis"],
          recommended_partners: recommendations as unknown as Database["public"]["Tables"]["virtual_organizations"]["Update"]["recommended_partners"],
        })
        .eq("id", projectId);

      if (error) throw new Error(error.message);

      return { gapAnalysis: gapAnalysisData, recommendedPartners: recommendations };
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
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      company,
      tender,
      teamMembers,
    }: {
      projectId: string;
      company: Company;
      tender: Tender;
      teamMembers: TeamMember[];
    }) => {
      const allCompanies = [company, ...teamMembers.map((m) => m.companies)].filter(
        Boolean
      );

      const prompt = `
You are a tender analysis expert. Analyze this tender against a full consortium team.

Tender: ${tender.title}
Description: ${tender.description || "Not provided"}
Buyer: ${tender.buyer_name || "Not specified"}
Value: £${tender.value?.toLocaleString() || "Not specified"}
Location: ${tender.region || "UK"}

Team Members:
${allCompanies
  .map(
    (c, idx) => `
${idx + 1}. ${c?.company_name} ${idx === 0 ? "(Lead)" : "(Partner)"}
   - Capabilities: ${c?.key_capabilities || "Not specified"}
   - Certifications: ${c?.certifications || "None"}
   - Past Projects: ${c?.past_projects || "None"}
   - Description: ${c?.description || "None"}
`
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

      // Save team analysis to database
      const { error } = await supabase
        .from("virtual_organizations")
        .update({
          team_analysis: teamAnalysisData as unknown as Database["public"]["Tables"]["virtual_organizations"]["Update"]["team_analysis"],
        })
        .eq("id", projectId);

      if (error) throw new Error(error.message);

      return { teamAnalysis: teamAnalysisData };
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

// Update project status mutation
export function useUpdateProjectStatus() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      status,
    }: {
      projectId: string;
      status: string;
    }) => {
      const { error } = await supabase
        .from("virtual_organizations")
        .update({ status })
        .eq("id", projectId);

      if (error) throw new Error(error.message);
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
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      // First delete team members
      await supabase.from("vo_members").delete().eq("vo_id", projectId);

      // Then delete project
      const { error } = await supabase
        .from("virtual_organizations")
        .delete()
        .eq("id", projectId);

      if (error) throw new Error(error.message);
      return { projectId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Send invitations mutation
export function useSendInvitations() {
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
      const result = await api.sendProjectInvitations(
        projectId,
        tenderTitle,
        partnerIds
      );
      return result;
    },
  });
}

// Update project tender mutation
export function useUpdateProjectTender() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      tenderId,
    }: {
      projectId: string;
      tenderId: string | null;
    }) => {
      const { error } = await supabase
        .from("virtual_organizations")
        .update({
          target_tender_id: tenderId,
          // Clear analysis when tender changes since it's no longer valid
          gap_analysis: null,
          team_analysis: null,
          recommended_partners: null,
        })
        .eq("id", projectId);

      if (error) throw new Error(error.message);
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
