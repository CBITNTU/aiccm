"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Building2, MapPin, Calendar, PoundSterling } from "lucide-react";
import { SectionCard } from "@/components/company/SectionCard";
import { EditExperienceSheet } from "@/components/company/EditExperienceSheet";
import { DraftBlock } from "@/components/company/DraftChangeIndicator";
import { useCompanyProjects } from "@/hooks/useCompanyProjects";
import type { PastProject } from "@/hooks/useCompanyProjects";
import type { CompanyRecord } from "@/lib/api/types";
import type { SectionPendingStatus } from "@/hooks/useCompanyPageData";
import type { PendingChanges } from "@/lib/companyFieldCategories";
import { useTranslations } from "next-intl";
import { useDeployment } from "@/lib/deployment/client";

function parsePastProjectsJson(raw: string | null | undefined): PastProject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return [];
}

interface ExperienceTabProps {
  companyData: CompanyRecord;
  companyId: string;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  sectionPendingStatus: SectionPendingStatus;
  pendingChanges?: PendingChanges | null;
  onSaved: (updated: CompanyRecord) => void;
  onDataRefresh: () => void;
}

export function ExperienceTab({
  companyData,
  companyId,
  isOwner,
  isVerified,
  isEditLocked,
  sectionPendingStatus,
  pendingChanges,
  onSaved,
  onDataRefresh,
}: ExperienceTabProps) {
  const t = useTranslations("CompanyPage");
  const { brand } = useDeployment();
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading } = useCompanyProjects(companyId);

  const pastProjects: PastProject[] = data?.pastProjects ?? [];
  const voProjects = data?.voProjects ?? [];

  // Parse pending draft projects
  const pendingPastProjects = pendingChanges?.scalarFields?.pastProjects
    ? parsePastProjectsJson(pendingChanges.scalarFields.pastProjects.proposed)
    : [];

  return (
    <>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Past Projects */}
        <SectionCard
          title={t("experience.pastProjects")}
          icon={Briefcase}
          hasPendingChange={sectionPendingStatus.experience}
          isEditLocked={isEditLocked}
          onEdit={isOwner ? () => setEditOpen(true) : undefined}
          hideEdit={!isOwner}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pastProjects.length > 0 ? (
            <div className="space-y-4">
              {pastProjects.map((project, idx) => (
                <ProjectCard key={idx} project={project} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t("experience.noPastProjects")} {isOwner && t("experience.addProjectHistory")}
            </p>
          )}

          {/* Draft changes */}
          {pendingPastProjects.length > 0 && (
            <DraftBlock label={t("experience.proposedPastProjects")}>
              <div className="space-y-3">
                {pendingPastProjects.map((project, idx) => (
                  <div key={idx} className="p-2 bg-amber-50 rounded border border-amber-200 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-medium text-amber-900">{project.name}</h4>
                      {project.year && (
                        <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-900 shrink-0">
                          {project.year}
                        </Badge>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-amber-800">{project.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-amber-700">
                      {project.client && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {project.client}
                        </span>
                      )}
                      {project.value && (
                        <span className="flex items-center gap-1">
                          <PoundSterling className="h-3 w-3" />
                          {project.value}
                        </span>
                      )}
                      {project.sector && (
                        <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-900">
                          {project.sector}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </DraftBlock>
          )}
        </SectionCard>

        {/* Platform Projects (VO) */}
        <SectionCard
          title={t("experience.platformProjects")}
          description={t("experience.platformProjectsDescription", { brand: brand.name })}
          icon={Building2}
          hideEdit
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : voProjects.length > 0 ? (
            <div className="space-y-4">
              {voProjects.map((project) => (
                <div key={project.id} className="p-3 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium">{project.name}</h4>
                    <Badge
                      variant={project.status === "active" ? "default" : "outline"}
                      className="text-xs shrink-0"
                    >
                      {project.status}
                    </Badge>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {project.tenderTitle && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {project.tenderTitle}
                      </span>
                    )}
                    {project.tenderBuyer && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {project.tenderBuyer}
                      </span>
                    )}
                    {project.tenderLocation && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {project.tenderLocation}
                      </span>
                    )}
                    {project.createdAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t("experience.noPlatformProjects")}
            </p>
          )}
        </SectionCard>
      </div>

      {/* Edit Sheet */}
      <EditExperienceSheet
        key={String(editOpen)}
        open={editOpen}
        onOpenChange={setEditOpen}
        companyData={companyData}
        companyId={companyId}
        isVerified={isVerified}
        isEditLocked={isEditLocked}
        pendingChanges={pendingChanges}
        onSaved={onSaved}
        onDataRefresh={onDataRefresh}
      />
    </>
  );
}

function ProjectCard({ project }: { project: PastProject }) {
  return (
    <div className="p-3 bg-muted/30 rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium">{project.name}</h4>
        {project.year && (
          <Badge variant="outline" className="text-xs shrink-0">
            {project.year}
          </Badge>
        )}
      </div>
      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {project.client && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {project.client}
          </span>
        )}
        {project.value && (
          <span className="flex items-center gap-1">
            <PoundSterling className="h-3 w-3" />
            {project.value}
          </span>
        )}
        {project.sector && (
          <Badge variant="secondary" className="text-xs">
            {project.sector}
          </Badge>
        )}
      </div>
    </div>
  );
}
