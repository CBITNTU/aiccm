"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Award, TrendingUp, MapPin } from "lucide-react";
import { SectionCard } from "@/components/company/SectionCard";
import { EditOverviewSheet } from "@/components/company/EditOverviewSheet";
import { EditOperationLocationsSheet } from "@/components/company/EditOperationLocationsSheet";
import { OperationLocationsEditor } from "@/components/company/OperationLocationsEditor";
import { DraftBlock } from "@/components/company/DraftChangeIndicator";
import { CompanyTaxonomySelector } from "@/components/CompanyTaxonomySelector";
import type { CompanyRecord } from "@/lib/api/types";
import type { SectionPendingStatus } from "@/hooks/useCompanyPageData";
import type { PendingChanges } from "@/lib/companyFieldCategories";

interface OverviewTabProps {
  companyData: CompanyRecord;
  companyId: string;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  sectionPendingStatus: SectionPendingStatus;
  pendingChanges?: PendingChanges | null;
  aiCompetencies: string[] | null;
  operationLocations: string[];
  onSaved: (updated: CompanyRecord) => void;
}

export function OverviewTab({
  companyData,
  companyId,
  isOwner,
  isVerified,
  isEditLocked,
  sectionPendingStatus,
  pendingChanges,
  aiCompetencies,
  operationLocations,
  onSaved,
}: OverviewTabProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editLocations, setEditLocations] = useState(false);

  return (
    <>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Company Overview */}
        <SectionCard
          title="Company Overview"
          hasPendingChange={sectionPendingStatus.overview}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditOpen(true) : undefined}
          hideEdit={!isOwner}
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
              <p className="text-sm">
                {companyData.description || (
                  <span className="text-muted-foreground italic">No description available</span>
                )}
              </p>
              {pendingChanges?.scalarFields?.description && (
                <DraftBlock label="Proposed description">
                  <p className="text-sm text-amber-900">
                    {pendingChanges.scalarFields.description.proposed || (
                      <span className="italic">Empty</span>
                    )}
                  </p>
                </DraftBlock>
              )}
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Capabilities</h4>
              <div className="flex flex-wrap gap-1.5">
                {companyData.keyCapabilities
                  ?.split(",")
                  .map((cap, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {cap.trim()}
                    </Badge>
                  )) || (
                  <p className="text-sm text-muted-foreground italic">
                    No capabilities listed
                  </p>
                )}
              </div>
              {pendingChanges?.scalarFields?.keyCapabilities && (
                <DraftBlock label="Proposed key capabilities">
                  <div className="flex flex-wrap gap-1.5">
                    {pendingChanges.scalarFields.keyCapabilities.proposed
                      ?.split(",")
                      .map((cap, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-900">
                          {cap.trim()}
                        </Badge>
                      )) || (
                      <span className="text-sm text-amber-700 italic">Empty</span>
                    )}
                  </div>
                </DraftBlock>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Taxonomy Selector */}
        <CompanyTaxonomySelector companyId={companyId} />

        {/* Operation Locations */}
        <SectionCard
          title="Operation Locations"
          icon={MapPin}
          onEdit={isOwner ? () => setEditLocations(true) : undefined}
          hideEdit={!isOwner}
        >
          {operationLocations.length > 0 ? (
            <OperationLocationsEditor
              value={operationLocations}
              onChange={() => {}}
              disabled
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No operation locations recorded
            </p>
          )}
        </SectionCard>

        {/* Core Competencies (AI) */}
        {aiCompetencies && aiCompetencies.length > 0 && (
          <SectionCard
            title="Core Competencies"
            description="AI-identified strengths"
            icon={Award}
            hideEdit
          >
            <div className="flex flex-wrap gap-1.5">
              {aiCompetencies.map((comp, idx) => (
                <Badge key={idx} variant="default" className="text-xs">
                  {comp}
                </Badge>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Business Insights */}
        {companyData.digitalMaturity && (
          <SectionCard
            title="Business Insights"
            icon={TrendingUp}
            hideEdit
          >
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Digital Maturity</span>
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                {companyData.digitalMaturity}
              </Badge>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Edit Sheets */}
      <EditOverviewSheet
        key={`overview-${editOpen}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        companyData={companyData}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        onSaved={onSaved}
      />
      <EditOperationLocationsSheet
        key={`locations-${editLocations}`}
        open={editLocations}
        onOpenChange={setEditLocations}
        companyData={companyData}
        operationLocations={operationLocations}
        isEditLocked={isEditLocked}
        onSaved={onSaved}
      />
    </>
  );
}
