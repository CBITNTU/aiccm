"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { CompanyRecord } from "@/lib/api/types";
import type { PendingChanges } from "@/lib/companyFieldCategories";
import {
  useUpdateCompany,
  useAnalyzeCompany,
} from "@/hooks/useCompanyMutations";
import {
  parseCertifications,
  parsePastProjects,
  parseOperationLocations,
  type Certification,
  type PastProject,
} from "@/components/company/companyParsers";
import { suggestLocationsFromCompanyLocation } from "@/lib/locationData";

export interface CompanyPageData {
  companyData: CompanyRecord | null;
  loading: boolean;
  isOwner: boolean;
  analysis: Record<string, unknown> | null;
  pendingChanges: PendingChanges | null;
  pendingReviewRequest: PendingReviewRequest | null;
  capabilities: { id: string; name: string; category: string }[];

  // Derived
  isVerified: boolean;
  isEditLocked: boolean;
  certifications: Certification[];
  pastProjects: PastProject[];
  operationLocations: string[];
  financialData: Record<string, { value: number; confidence: number }> | null;
  aiCompetencies: string[] | null;
  sectionPendingStatus: SectionPendingStatus;

  // Mutations
  updateCompanyMutation: ReturnType<typeof useUpdateCompany>;
  analyzeCompanyMutation: ReturnType<typeof useAnalyzeCompany>;
  isSaving: boolean;
  isAnalyzing: boolean;

  // Actions
  refreshCompanyData: () => Promise<void>;
  setCompanyData: (data: CompanyRecord) => void;
  handleRefreshAnalysis: () => Promise<void>;
}

export interface PendingReviewRequest {
  id: string;
  status: string;
  requestType: string;
  reviewFeedback: Record<string, unknown> | null;
  reviewNotes: string | null;
  createdAt: string;
}

export interface SectionPendingStatus {
  companyName: boolean;
  overview: boolean;
  certifications: boolean;
  pastProjects: boolean;
  equipment: boolean;
  capabilities: boolean;
  markets: boolean;
  standards: boolean;
}

function getSectionPendingStatus(pc: PendingChanges | null): SectionPendingStatus {
  return {
    companyName: !!pc?.scalarFields?.companyName,
    overview: !!(pc?.scalarFields?.description || pc?.scalarFields?.keyCapabilities),
    certifications: !!pc?.scalarFields?.certifications,
    pastProjects: !!pc?.scalarFields?.pastProjects,
    equipment: !!pc?.scalarFields?.equipment,
    capabilities: !!pc?.capabilities,
    markets: !!pc?.markets,
    standards: !!pc?.standards,
  };
}

export function useCompanyPageData(
  companyId: string,
  userId: string | null | undefined,
): CompanyPageData {
  const router = useRouter();

  const [companyData, setCompanyData] = useState<CompanyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChanges | null>(null);
  const [pendingReviewRequest, setPendingReviewRequest] = useState<PendingReviewRequest | null>(null);
  const [capabilities, setCapabilities] = useState<{ id: string; name: string; category: string }[]>([]);

  const updateCompanyMutation = useUpdateCompany();
  const analyzeCompanyMutation = useAnalyzeCompany();

  const refreshCompanyData = useCallback(async () => {
    if (!userId || !companyId) return;
    try {
      const data = await api.getCompany(companyId);
      setCompanyData(data.company);
      setIsOwner(data.isOwner);
      setCapabilities(data.capabilities);
      setPendingChanges((data.pendingChanges as PendingChanges | null) ?? null);
      setPendingReviewRequest(data.pendingReviewRequest ?? null);

      const company = data.company as unknown as Record<string, unknown>;
      if (company.aiAnalysis) {
        setAnalysis(company.aiAnalysis as Record<string, unknown>);
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast.error("Failed to load company data");
      router.push("/profile");
    }
  }, [userId, companyId, router]);

  useEffect(() => {
    if (!userId || !companyId) return;
    setLoading(true);
    refreshCompanyData().finally(() => setLoading(false));
  }, [userId, companyId, refreshCompanyData]);

  const handleRefreshAnalysis = useCallback(async () => {
    if (!companyData) return;
    try {
      const data = await analyzeCompanyMutation.mutateAsync(companyData.id);
      if (data?.success && data?.analysis) {
        setAnalysis(data.analysis as Record<string, unknown>);
        const refreshed = await api.getCompany(companyData.id);
        setCompanyData(refreshed.company);
        setCapabilities(refreshed.capabilities);
        toast.success("Company profile analysis has been refreshed.");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze profile");
    }
  }, [companyData, analyzeCompanyMutation]);

  const isVerified = companyData?.verificationStatus === "verified";
  const isEditLocked = !!pendingReviewRequest;

  const certifications = useMemo(
    () => parseCertifications(companyData?.certifications),
    [companyData?.certifications],
  );

  const pastProjects = useMemo(
    () => parsePastProjects(companyData?.pastProjects),
    [companyData?.pastProjects],
  );

  const operationLocations = useMemo(
    () =>
      parseOperationLocations(
        companyData?.operationLocations,
        companyData?.address,
        companyData?.postcode,
        suggestLocationsFromCompanyLocation,
      ),
    [companyData?.operationLocations, companyData?.address, companyData?.postcode],
  );

  const financialData = (companyData?.financialData as Record<
    string,
    { value: number; confidence: number }
  > | null) ?? null;

  const aiCompetencies = (companyData?.aiCompetencies as string[] | null) ?? null;

  const sectionPendingStatus = useMemo(
    () => getSectionPendingStatus(pendingChanges),
    [pendingChanges],
  );

  return {
    companyData,
    loading,
    isOwner,
    analysis,
    pendingChanges,
    pendingReviewRequest,
    capabilities,
    isVerified,
    isEditLocked,
    certifications,
    pastProjects,
    operationLocations,
    financialData,
    aiCompetencies,
    sectionPendingStatus,
    updateCompanyMutation,
    analyzeCompanyMutation,
    isSaving: updateCompanyMutation.isPending,
    isAnalyzing: analyzeCompanyMutation.isPending,
    refreshCompanyData,
    setCompanyData,
    handleRefreshAnalysis,
  };
}
