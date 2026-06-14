"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tag, Globe, Award, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/company/SectionCard";
import { DraftRelationChanges } from "@/components/company/DraftChangeIndicator";
import { EditCompetenciesSheet } from "@/components/company/EditCompetenciesSheet";
import { EditMarketsSheet } from "@/components/company/EditMarketsSheet";
import { EditStandardsSheet } from "@/components/company/EditStandardsSheet";
import type { SectionPendingStatus } from "@/hooks/useCompanyPageData";
import type { PendingChanges } from "@/lib/companyFieldCategories";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  useCompanyCapabilities,
  useCompanyMarkets,
  useCompanyStandards,
} from "@/hooks/useCompanyTaxonomy";
import { useTranslations } from "next-intl";

interface CapabilitiesTabProps {
  companyId: string;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  sectionPendingStatus: SectionPendingStatus;
  pendingChanges?: PendingChanges | null;
  onDataRefresh: () => void;
}

export function CapabilitiesTab({
  companyId,
  isOwner,
  isVerified,
  isEditLocked,
  sectionPendingStatus,
  pendingChanges,
  onDataRefresh,
}: CapabilitiesTabProps) {
  const t = useTranslations("CompanyPage");
  const [editCompetencies, setEditCompetencies] = useState(false);
  const [editMarkets, setEditMarkets] = useState(false);
  const [editStandards, setEditStandards] = useState(false);

  const queryClient = useQueryClient();

  // Company-specific selections — small payloads, cached + deduped via React Query.
  const capabilitiesQuery = useCompanyCapabilities(companyId);
  const marketsQuery = useCompanyMarkets(companyId);
  const standardsQuery = useCompanyStandards(companyId);

  const capabilities = capabilitiesQuery.data?.capabilities ?? [];
  const competencyLimit = capabilitiesQuery.data?.competencyLimit ?? null;
  const markets = marketsQuery.data?.markets ?? [];
  const standards = standardsQuery.data?.standards ?? [];
  const loading =
    capabilitiesQuery.isPending || marketsQuery.isPending || standardsQuery.isPending;

  // Pending-change diffs only need names for the handful of added/removed ids,
  // so resolve those targeted instead of fetching the entire reference list.
  const capPendingIds = useMemo(
    () =>
      pendingChanges?.capabilities
        ? [...pendingChanges.capabilities.added, ...pendingChanges.capabilities.removed]
        : [],
    [pendingChanges],
  );
  const marketPendingIds = useMemo(
    () =>
      pendingChanges?.markets
        ? [...pendingChanges.markets.added, ...pendingChanges.markets.removed]
        : [],
    [pendingChanges],
  );

  const capNamesQuery = useQuery({
    queryKey: ["capabilityNames", [...capPendingIds].sort()],
    queryFn: async () => (await api.getCapabilityNames(capPendingIds)).capabilities,
    enabled: capPendingIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const marketNamesQuery = useQuery({
    queryKey: ["marketNames", [...marketPendingIds].sort()],
    queryFn: async () => (await api.getMarketNames(marketPendingIds)).markets,
    enabled: marketPendingIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  // Standards reference list is small, so the full list is fine here.
  const stdRefQuery = useQuery({
    queryKey: queryKeys.referenceStandards(),
    queryFn: async () => (await api.getStandards()).standards,
    enabled: !!pendingChanges?.standards,
    staleTime: 30 * 60 * 1000,
  });

  const capNameMap = useMemo(
    () => capNamesQuery.data?.reduce<Record<string, string>>((acc, c) => { acc[c.id] = c.name; return acc; }, {}) ?? {},
    [capNamesQuery.data],
  );
  const marketNameMap = useMemo(
    () => marketNamesQuery.data?.reduce<Record<string, string>>((acc, m) => { acc[m.id] = m.name; return acc; }, {}) ?? {},
    [marketNamesQuery.data],
  );
  const stdNameMap = useMemo(
    () => stdRefQuery.data?.reduce<Record<string, string>>((acc, s) => { acc[s.id] = s.name; return acc; }, {}) ?? {},
    [stdRefQuery.data],
  );

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.companyCapabilities(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.companyMarkets(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.companyStandards(companyId) });
    onDataRefresh();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Competencies */}
        <SectionCard
          title={t("capabilities.competencies")}
          icon={Tag}
          hasPendingChange={sectionPendingStatus.capabilities}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditCompetencies(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="flex flex-wrap gap-1.5">
            {capabilities.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                {t("capabilities.noCompetenciesSelected")}
              </span>
            ) : (
              capabilities.map((cap) => (
                <Badge key={cap.id} variant="secondary" className="text-xs">
                  {cap.name}
                </Badge>
              ))
            )}
          </div>
          {pendingChanges?.capabilities && (
            <DraftRelationChanges
              added={pendingChanges.capabilities.added}
              removed={pendingChanges.capabilities.removed}
              nameMap={capNameMap}
              loading={capPendingIds.length > 0 && capNamesQuery.isPending}
            />
          )}
        </SectionCard>

        {/* Markets */}
        <SectionCard
          title={t("capabilities.markets")}
          icon={Globe}
          hasPendingChange={sectionPendingStatus.markets}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditMarkets(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="flex flex-wrap gap-1.5">
            {markets.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                {t("capabilities.noMarketsSelected")}
              </span>
            ) : (
              markets.map((m) => (
                <Badge key={m.id} variant="secondary" className="text-xs">
                  {m.name}
                </Badge>
              ))
            )}
          </div>
          {pendingChanges?.markets && (
            <DraftRelationChanges
              added={pendingChanges.markets.added}
              removed={pendingChanges.markets.removed}
              nameMap={marketNameMap}
              loading={marketPendingIds.length > 0 && marketNamesQuery.isPending}
            />
          )}
        </SectionCard>

        {/* Standards */}
        <SectionCard
          title={t("capabilities.standardsCertifications")}
          icon={Award}
          hasPendingChange={sectionPendingStatus.standards}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditStandards(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="flex flex-wrap gap-1.5">
            {standards.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                {t("capabilities.noStandardsSelected")}
              </span>
            ) : (
              standards.map((s) => (
                <Badge key={s.id} variant="secondary" className="text-xs">
                  {s.name}
                </Badge>
              ))
            )}
          </div>
          {pendingChanges?.standards && (
            <DraftRelationChanges
              added={pendingChanges.standards.added}
              removed={pendingChanges.standards.removed}
              nameMap={stdNameMap}
              loading={!!pendingChanges?.standards && stdRefQuery.isPending}
            />
          )}
        </SectionCard>
      </div>

      {/* Edit Sheets */}
      <EditCompetenciesSheet
        open={editCompetencies}
        onOpenChange={setEditCompetencies}
        companyId={companyId}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        competencyLimit={competencyLimit}
        pendingRelation={pendingChanges?.capabilities}
        onSaved={handleSaved}
      />
      <EditMarketsSheet
        open={editMarkets}
        onOpenChange={setEditMarkets}
        companyId={companyId}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        pendingRelation={pendingChanges?.markets}
        onSaved={handleSaved}
      />
      <EditStandardsSheet
        open={editStandards}
        onOpenChange={setEditStandards}
        companyId={companyId}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        pendingRelation={pendingChanges?.standards}
        onSaved={handleSaved}
      />
    </>
  );
}
