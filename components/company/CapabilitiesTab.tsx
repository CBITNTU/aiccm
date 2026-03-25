"use client";

import { useState, useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
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

interface CapabilitiesTabProps {
  companyId: string;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  sectionPendingStatus: SectionPendingStatus;
  pendingChanges?: PendingChanges | null;
  onDataRefresh: () => void;
}

interface CapabilityItem {
  id: string;
  name: string;
  category: string;
}

interface MarketItem {
  id: string;
  name: string;
}

interface StandardItem {
  id: string;
  name: string;
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
  const [editCompetencies, setEditCompetencies] = useState(false);
  const [editMarkets, setEditMarkets] = useState(false);
  const [editStandards, setEditStandards] = useState(false);

  // Local display data
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [competencyLimit, setCompetencyLimit] = useState<number | null>(null);

  // Fetch reference names for draft diff display
  const needsCapRef = !!pendingChanges?.capabilities;
  const needsMarketRef = !!pendingChanges?.markets;
  const needsStdRef = !!pendingChanges?.standards;

  const [capRefQuery, marketRefQuery, stdRefQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.referenceCapabilities(),
        queryFn: async () => (await api.getCapabilities()).capabilities,
        staleTime: 30 * 60 * 1000,
        enabled: needsCapRef,
      },
      {
        queryKey: queryKeys.referenceMarkets(),
        queryFn: async () => (await api.getMarkets()).markets,
        staleTime: 30 * 60 * 1000,
        enabled: needsMarketRef,
      },
      {
        queryKey: queryKeys.referenceStandards(),
        queryFn: async () => (await api.getStandards()).standards,
        staleTime: 30 * 60 * 1000,
        enabled: needsStdRef,
      },
    ],
  });

  const capNameMap = useMemo(
    () => capRefQuery.data?.reduce<Record<string, string>>((acc, c) => { acc[c.id] = c.name; return acc; }, {}) ?? {},
    [capRefQuery.data],
  );
  const marketNameMap = useMemo(
    () => marketRefQuery.data?.reduce<Record<string, string>>((acc, m) => { acc[m.id] = m.name; return acc; }, {}) ?? {},
    [marketRefQuery.data],
  );
  const stdNameMap = useMemo(
    () => stdRefQuery.data?.reduce<Record<string, string>>((acc, s) => { acc[s.id] = s.name; return acc; }, {}) ?? {},
    [stdRefQuery.data],
  );

  useEffect(() => {
    Promise.all([
      api.getCompanyCapabilities(companyId),
      api.getCompanyMarkets(companyId),
      api.getCompanyStandards(companyId),
    ])
      .then(([capData, marketData, stdData]) => {
        setCapabilities(capData.capabilities);
        setCompetencyLimit(capData.competencyLimit ?? null);
        setMarkets(marketData.markets || []);
        setStandards(stdData.standards || []);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleSaved = () => {
    // Refresh display data
    Promise.all([
      api.getCompanyCapabilities(companyId),
      api.getCompanyMarkets(companyId),
      api.getCompanyStandards(companyId),
    ]).then(([capData, marketData, stdData]) => {
      setCapabilities(capData.capabilities);
      setMarkets(marketData.markets || []);
      setStandards(stdData.standards || []);
    });
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
          title="Competencies"
          icon={Tag}
          hasPendingChange={sectionPendingStatus.capabilities}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditCompetencies(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="flex flex-wrap gap-1.5">
            {capabilities.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                No competencies selected
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
              loading={needsCapRef && capRefQuery.isPending}
            />
          )}
        </SectionCard>

        {/* Markets */}
        <SectionCard
          title="Markets"
          icon={Globe}
          hasPendingChange={sectionPendingStatus.markets}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditMarkets(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="flex flex-wrap gap-1.5">
            {markets.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                No markets selected
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
              loading={needsMarketRef && marketRefQuery.isPending}
            />
          )}
        </SectionCard>

        {/* Standards */}
        <SectionCard
          title="Standards & Certifications"
          icon={Award}
          hasPendingChange={sectionPendingStatus.standards}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditStandards(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="flex flex-wrap gap-1.5">
            {standards.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">
                No standards selected
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
              loading={needsStdRef && stdRefQuery.isPending}
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
