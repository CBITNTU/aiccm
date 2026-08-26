"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Mail,
  Phone,
  MapPin,
  Edit2,
  RefreshCw,
  ShieldCheck,
  Clock,
} from "lucide-react";
import type { CompanyRecord } from "@/lib/api/types";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import type { AnalysisUsage } from "@/hooks/useCompanyPageData";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";

interface CompanyHeroHeaderProps {
  companyData: CompanyRecord;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  isAnalyzing: boolean;
  hasAnalysis: boolean;
  capabilitiesCount: number;
  onEditInfo: () => void;
  onAnalyze: () => void;
  analysisUsage?: AnalysisUsage | null;
  analysisLimitReached?: boolean;
}

export function CompanyHeroHeader({
  companyData,
  isOwner,
  isVerified,
  isEditLocked: _isEditLocked,
  isAnalyzing,
  hasAnalysis,
  capabilitiesCount,
  onEditInfo,
  onAnalyze,
  analysisUsage,
  analysisLimitReached,
}: CompanyHeroHeaderProps) {
  const t = useTranslations("CompanyPage");
  return (
    <Card className="card-professional">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Company identity */}
          <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
            <CompanyLogo
              companyName={companyData.companyName}
              logoUrl={companyData.logoUrl}
              size="md"
              fallback="icon"
            />
            <div className="min-w-0 overflow-hidden">
              <CardTitle className="text-xl font-bold text-foreground truncate">
                {companyData.companyName}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {companyData.companiesHouseNumber ? (
                  <>
                    {t("heroHeader.companiesHouse")}{" "}
                    <a
                      href={`https://find-and-update.company-information.service.gov.uk/company/${companyData.companiesHouseNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {companyData.companiesHouseNumber}
                    </a>
                  </>
                ) : (
                  <span className="italic">{t("heroHeader.noCompaniesHouse")}</span>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {isOwner && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={onEditInfo}>
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                {t("heroHeader.editInfo")}
              </Button>
              <TooltipProvider>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        className="btn-cta"
                        onClick={onAnalyze}
                        disabled={isAnalyzing || !!analysisLimitReached}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 mr-1.5 ${isAnalyzing ? "animate-spin" : ""}`}
                        />
                        {isAnalyzing ? t("heroHeader.analyzing") : hasAnalysis ? t("heroHeader.reanalyze") : t("heroHeader.analyze")}
                      </Button>
                    </TooltipTrigger>
                    {analysisLimitReached && (
                      <TooltipContent>
                        <p className="text-xs">
                          {t("heroHeader.analysisLimitReached")}
                          {analysisUsage?.resetsAt && (
                            <> {t("heroHeader.analysisResetsOn", { date: new Date(analysisUsage.resetsAt).toLocaleDateString() })}</>
                          )}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {analysisUsage && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={analysisLimitReached ? "destructive" : "secondary"}
                          className="text-xs cursor-default"
                        >
                          {analysisUsage.used}/{analysisUsage.limit}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {t("heroHeader.analysisUsageTooltip", { used: analysisUsage.used, limit: analysisUsage.limit })}
                          {analysisUsage.resetsAt && (
                            <> {t("heroHeader.analysisResetsOn", { date: new Date(analysisUsage.resetsAt).toLocaleDateString() })}</>
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TooltipProvider>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Stats pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {isVerified ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
              <ShieldCheck className="h-3 w-3 mr-1" />
              {t("heroHeader.verified")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-200">
              <Clock className="h-3 w-3 mr-1" />
              {t("heroHeader.unverified")}
            </Badge>
          )}
          {capabilitiesCount > 0 && (
            <Badge variant="secondary">
              {capabilitiesCount} {t("heroHeader.competencies")}
            </Badge>
          )}
          {companyData.digitalMaturity && (
            <Badge variant="secondary">
              {companyData.digitalMaturity}
            </Badge>
          )}
        </div>

        {/* Contact info grid */}
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4 shrink-0" />
            {companyData.websiteUrl ? (
              <a
                href={companyData.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate"
              >
                {companyData.websiteUrl}
              </a>
            ) : (
              <span className="italic">{t("heroHeader.noWebsite")}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{companyData.contactEmail || t("heroHeader.notSpecified")}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0" />
            <span>{companyData.contactPhone || t("heroHeader.notSpecified")}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            {companyData.address || companyData.postcode ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  companyData.address || companyData.postcode || "",
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate"
              >
                {companyData.address || companyData.postcode}
              </a>
            ) : (
              <span className="italic">{t("heroHeader.noLocation")}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
