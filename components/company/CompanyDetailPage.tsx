"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  FileText,
  Tag,
  Users,
  TrendingUp,
  Briefcase,
} from "lucide-react";
import { useCompanyPageData } from "@/hooks/useCompanyPageData";
import { VerificationBanner } from "@/components/company/VerificationBanner";
import { CompanyHeroHeader } from "@/components/company/CompanyHeroHeader";
import { PendingChangesBar } from "@/components/company/PendingChangesBar";
import { EditBasicInfoSheet } from "@/components/company/EditBasicInfoSheet";
import { OverviewTab } from "@/components/company/OverviewTab";
import { CapabilitiesTab } from "@/components/company/CapabilitiesTab";
import { TeamTab } from "@/components/company/TeamTab";
import { IntelligenceTab } from "@/components/company/IntelligenceTab";
import { ExperienceTab } from "@/components/company/ExperienceTab";

interface CompanyDetailPageProps {
  companyId: string;
  basePath: string;
}

export function CompanyDetailPage({ companyId, basePath }: CompanyDetailPageProps) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";

  const data = useCompanyPageData(companyId, user?.id);
  const [editBasicInfo, setEditBasicInfo] = useState(false);

  const handleTabChange = (value: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", value);
    router.replace(`${basePath}?${p.toString()}`, { scroll: false });
  };

  if (data.loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading company details...</p>
      </div>
    );
  }

  if (!data.companyData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-muted-foreground">Company not found. Redirecting...</p>
      </div>
    );
  }

  const hasPendingBar = data.isOwner && !!data.pendingChanges;

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${hasPendingBar ? "pb-24" : ""}`}>
      {/* Verification Banner */}
      <div className="mb-4">
        <VerificationBanner
          companyId={companyId}
          companyData={data.companyData}
          isOwner={data.isOwner}
          hasPendingChanges={!!data.pendingChanges}
          pendingReviewRequest={data.pendingReviewRequest}
          latestResolvedRequest={data.latestResolvedRequest}
        />
      </div>

      {/* Hero Header */}
      <div className="mb-6">
        <CompanyHeroHeader
          companyData={data.companyData}
          isOwner={data.isOwner}
          isVerified={data.isVerified}
          isEditLocked={data.isEditLocked}
          isAnalyzing={data.isAnalyzing}
          hasAnalysis={!!data.analysis}
          capabilitiesCount={data.capabilities.length}
          onEditInfo={() => setEditBasicInfo(true)}
          onAnalyze={data.handleRefreshAnalysis}
          analysisUsage={data.analysisUsage}
          analysisLimitReached={data.analysisLimitReached}
        />
      </div>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="capabilities" className="gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Capabilities
            </TabsTrigger>
            <TabsTrigger value="experience" className="gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Experience
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Team
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Intelligence
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="overview">
          <OverviewTab
            companyData={data.companyData}
            companyId={companyId}
            isOwner={data.isOwner}
            isVerified={data.isVerified}
            isEditLocked={data.isEditLocked}
            sectionPendingStatus={data.sectionPendingStatus}
            pendingChanges={data.pendingChanges}
            aiCompetencies={data.aiCompetencies}
            operationLocations={data.operationLocations}
            onSaved={(updated) => data.setCompanyData(updated)}
          />
        </TabsContent>

        <TabsContent value="capabilities">
          <CapabilitiesTab
            companyId={companyId}
            isOwner={data.isOwner}
            isVerified={data.isVerified}
            isEditLocked={data.isEditLocked}
            sectionPendingStatus={data.sectionPendingStatus}
            pendingChanges={data.pendingChanges}
            onDataRefresh={data.refreshCompanyData}
          />
        </TabsContent>

        <TabsContent value="experience">
          <ExperienceTab
            companyData={data.companyData}
            companyId={companyId}
            isOwner={data.isOwner}
            isVerified={data.isVerified}
            isEditLocked={data.isEditLocked}
            sectionPendingStatus={data.sectionPendingStatus}
            pendingChanges={data.pendingChanges}
            onSaved={(updated) => data.setCompanyData(updated)}
            onDataRefresh={data.refreshCompanyData}
          />
        </TabsContent>

        <TabsContent value="team">
          <TeamTab
            companyId={companyId}
            companyName={data.companyData.companyName}
            isOwner={data.isOwner}
            currentUserId={user?.id}
          />
        </TabsContent>

        <TabsContent value="intelligence">
          <IntelligenceTab
            financialData={data.financialData}
            analysis={data.analysis}
            isAnalyzing={data.isAnalyzing}
            onAnalyze={data.handleRefreshAnalysis}
            analysisUsage={data.analysisUsage}
            analysisLimitReached={data.analysisLimitReached}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Basic Info Sheet */}
      <EditBasicInfoSheet
        key={String(editBasicInfo)}
        open={editBasicInfo}
        onOpenChange={setEditBasicInfo}
        companyData={data.companyData}
        isVerified={data.isVerified}
        isEditLocked={data.isEditLocked}
        onSaved={(updated) => data.setCompanyData(updated)}
      />

      {/* Floating Pending Changes Bar */}
      {hasPendingBar && data.pendingChanges && (
        <PendingChangesBar
          companyId={companyId}
          pendingChanges={data.pendingChanges}
          pendingReviewRequest={data.pendingReviewRequest}
          latestResolvedRequest={data.latestResolvedRequest}
          onSuccess={data.refreshCompanyData}
        />
      )}
    </div>
  );
}
