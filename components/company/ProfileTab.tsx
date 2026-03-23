"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Briefcase, Award, MapPin } from "lucide-react";
import { SectionCard } from "@/components/company/SectionCard";
import { DraftBlock } from "@/components/company/DraftChangeIndicator";
import { EditPastProjectsSheet } from "@/components/company/EditPastProjectsSheet";
import { EditCertificationsSheet } from "@/components/company/EditCertificationsSheet";
import { EditOperationLocationsSheet } from "@/components/company/EditOperationLocationsSheet";
import { OperationLocationsEditor } from "@/components/company/OperationLocationsEditor";
import {
  parseCertifications,
  parsePastProjects,
} from "@/components/company/companyParsers";
import type { CompanyRecord } from "@/lib/api/types";
import type { SectionPendingStatus } from "@/hooks/useCompanyPageData";
import type { PendingChanges } from "@/lib/companyFieldCategories";
import type { Certification, PastProject } from "@/components/company/companyParsers";

interface ProfileTabProps {
  companyData: CompanyRecord;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  sectionPendingStatus: SectionPendingStatus;
  pendingChanges?: PendingChanges | null;
  pastProjects: PastProject[];
  certifications: Certification[];
  operationLocations: string[];
  onSaved: (updated: CompanyRecord) => void;
}

export function ProfileTab({
  companyData,
  isOwner,
  isVerified,
  isEditLocked,
  sectionPendingStatus,
  pendingChanges,
  pastProjects,
  certifications,
  operationLocations,
  onSaved,
}: ProfileTabProps) {
  const [editProjects, setEditProjects] = useState(false);
  const [editCerts, setEditCerts] = useState(false);
  const [editLocations, setEditLocations] = useState(false);

  return (
    <>
      <div className="space-y-6">
        {/* Past Projects */}
        <SectionCard
          title="Past Projects"
          icon={Briefcase}
          hasPendingChange={sectionPendingStatus.pastProjects}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditProjects(true) : undefined}
          hideEdit={!isOwner}
        >
          {pastProjects.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {pastProjects.map((project, idx) => (
                <AccordionItem key={idx} value={`project-${idx}`}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>{project.name}</span>
                      {project.year && (
                        <Badge variant="secondary" className="text-xs">
                          {project.year}
                        </Badge>
                      )}
                      {project.value && (
                        <Badge variant="outline" className="text-xs">
                          {project.value}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground">
                      {project.description || "No description available"}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No past projects recorded
            </p>
          )}
          {pendingChanges?.scalarFields?.pastProjects && (() => {
            const draftProjects = parsePastProjects(pendingChanges.scalarFields.pastProjects.proposed);
            return draftProjects.length > 0 ? (
              <DraftBlock label={`Proposed projects (${draftProjects.length})`}>
                <div className="space-y-1.5">
                  {draftProjects.map((p, idx) => (
                    <div key={idx} className="text-sm text-amber-900 flex items-center gap-2">
                      <span>{p.name}</span>
                      {p.year && <Badge variant="outline" className="text-[10px] border-amber-300">{p.year}</Badge>}
                    </div>
                  ))}
                </div>
              </DraftBlock>
            ) : null;
          })()}
        </SectionCard>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Certifications */}
          <SectionCard
            title="Certifications"
            icon={Award}
            hasPendingChange={sectionPendingStatus.certifications}
            isEditLocked={isEditLocked}
            onEdit={isOwner ? () => setEditCerts(true) : undefined}
            hideEdit={!isOwner}
          >
            {certifications.length > 0 ? (
              <div className="space-y-2">
                {certifications.map((cert, idx) => (
                  <div key={idx} className="p-2.5 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium">{cert.name}</p>
                    {cert.issuer && (
                      <p className="text-xs text-muted-foreground">
                        Issuer: {cert.issuer}
                      </p>
                    )}
                    {cert.validUntil && (
                      <p className="text-xs text-muted-foreground">
                        Valid until: {cert.validUntil}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No certifications recorded
              </p>
            )}
            {pendingChanges?.scalarFields?.certifications && (() => {
              const draftCerts = parseCertifications(pendingChanges.scalarFields.certifications.proposed);
              return draftCerts.length > 0 ? (
                <DraftBlock label={`Proposed certifications (${draftCerts.length})`}>
                  <div className="space-y-1.5">
                    {draftCerts.map((c, idx) => (
                      <div key={idx} className="text-sm text-amber-900">
                        <span>{c.name}</span>
                        {c.issuer && <span className="text-xs text-amber-700 ml-1">({c.issuer})</span>}
                      </div>
                    ))}
                  </div>
                </DraftBlock>
              ) : null;
            })()}
          </SectionCard>

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
        </div>
      </div>

      {/* Edit Sheets */}
      <EditPastProjectsSheet
        open={editProjects}
        onOpenChange={setEditProjects}
        companyData={companyData}
        pastProjects={pastProjects}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        onSaved={onSaved}
      />
      <EditCertificationsSheet
        open={editCerts}
        onOpenChange={setEditCerts}
        companyData={companyData}
        certifications={certifications}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        onSaved={onSaved}
      />
      <EditOperationLocationsSheet
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
