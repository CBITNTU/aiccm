"use client";

import { useState, useEffect } from "react";
import type { CompanyRecord } from "@/lib/api/types";
import type { JsonValue } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { PastProjectsDisplay } from "@/components/company/PastProjectsDisplay";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  User,
  ExternalLink,
  ArrowLeft,
  Save,
  Loader2,
  ShieldCheck,
  Clock,
  Zap,
  Brain,
} from "lucide-react";
import { toast } from "sonner";

interface AdminCompanyDetailSheetProps {
  company: CompanyRecord | null;
  onClose: () => void;
  onCompanyUpdated: () => void;
}

interface UsageData {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export function AdminCompanyDetailSheet({
  company,
  onClose,
  onCompanyUpdated,
}: AdminCompanyDetailSheetProps) {
  return (
    <Sheet open={!!company} onOpenChange={() => onClose()}>
      <SheetContent
        side="right"
        className="w-[95vw] sm:max-w-[900px] p-0 flex flex-col [&>button]:hidden"
      >
        <SheetTitle className="sr-only">Company Details</SheetTitle>
        <SheetDescription className="sr-only">View company details and manage settings</SheetDescription>
        {company && (
          <SheetInner
            company={company}
            onClose={onClose}
            onCompanyUpdated={onCompanyUpdated}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetInner({
  company,
  onClose,
  onCompanyUpdated,
}: {
  company: CompanyRecord;
  onClose: () => void;
  onCompanyUpdated: () => void;
}) {
  const isVerified = company.verificationStatus === "verified";

  return (
    <>
      {/* Header */}
      <SheetHeader className="px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-lg truncate">
              {company.companyName}
            </SheetTitle>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              {isVerified ? (
                <Badge variant="default" className="text-xs gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Unverified
                </Badge>
              )}
              {company.postcode && <span>{company.postcode}</span>}
              {company.status && (
                <span className="capitalize">{company.status}</span>
              )}
            </div>
          </div>
        </div>
      </SheetHeader>

      {/* Tabs Content */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 border-b shrink-0">
          <TabsList className="h-10">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
            <TabsTrigger value="ai">AI Analysis</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            <TabsContent value="overview" className="mt-0">
              <OverviewTab company={company} />
            </TabsContent>

            <TabsContent value="capabilities" className="mt-0">
              <CapabilitiesTab company={company} />
            </TabsContent>

            <TabsContent value="ai" className="mt-0">
              <AIAnalysisTab company={company} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0">
              <SettingsTab
                company={company}
                onCompanyUpdated={onCompanyUpdated}
              />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </>
  );
}

// =============================================================================
// Shared sub-components
// =============================================================================

function DataField({
  label,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      {value ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            {value}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="text-sm">{value}</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground italic">Not provided</p>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// =============================================================================
// Tab Components
// =============================================================================

function OverviewTab({ company }: { company: CompanyRecord }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Business Information" icon={Building2}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label="Company Name" value={company.companyName} />
          <DataField
            label="Companies House Number"
            value={company.companiesHouseNumber}
            href={
              company.companiesHouseNumber
                ? `https://find-and-update.company-information.service.gov.uk/company/${company.companiesHouseNumber}`
                : undefined
            }
          />
          <div className="col-span-2">
            <DataField label="Description" value={company.description ?? null} />
          </div>
          <DataField label="Address" value={company.address ?? null} icon={MapPin} />
          <DataField label="Postcode" value={company.postcode ?? null} />
        </div>
      </SectionCard>

      <SectionCard title="Contact Information" icon={User}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label="Contact Person" value={company.contactPerson} />
          <DataField
            label="Email"
            value={company.contactEmail}
            href={company.contactEmail ? `mailto:${company.contactEmail}` : undefined}
            icon={Mail}
          />
          <DataField
            label="Phone"
            value={company.contactPhone}
            href={company.contactPhone ? `tel:${company.contactPhone}` : undefined}
            icon={Phone}
          />
          <DataField
            label="Website"
            value={company.websiteUrl}
            href={company.websiteUrl ?? undefined}
            icon={Globe}
          />
        </div>
      </SectionCard>

      <SectionCard title="Status" icon={Clock}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label="Verification Status" value={company.verificationStatus ?? "Unverified"} />
          <DataField
            label="Verified At"
            value={company.verifiedAt ? new Date(company.verifiedAt).toLocaleDateString() : null}
          />
          <DataField
            label="Created"
            value={new Date(company.createdAt).toLocaleDateString()}
          />
          <DataField
            label="Updated"
            value={new Date(company.updatedAt).toLocaleDateString()}
          />
        </div>
      </SectionCard>
    </div>
  );
}

function CapabilitiesTab({ company }: { company: CompanyRecord }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Key Capabilities">
        {company.keyCapabilities ? (
          <div className="flex flex-wrap gap-1.5">
            {company.keyCapabilities.split(",").map((cap, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {cap.trim()}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No capabilities listed</p>
        )}
      </SectionCard>

      <SectionCard title="Certifications">
        {company.certifications ? (
          <p className="text-sm">{company.certifications}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No certifications listed</p>
        )}
      </SectionCard>

      <SectionCard title="Equipment">
        {company.equipment ? (
          <p className="text-sm">{company.equipment}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No equipment listed</p>
        )}
      </SectionCard>

      <SectionCard title="Past Projects">
        <PastProjectsDisplay value={company.pastProjects} />
      </SectionCard>

      {company.aiCompetencies && (
        <SectionCard title="AI-Suggested Competencies">
          <div className="flex flex-wrap gap-1.5">
            {(company.aiCompetencies as string[]).map((comp, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {comp}
              </Badge>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function AIAnalysisTab({ company }: { company: CompanyRecord }) {
  const aiAnalysis = company.aiAnalysis as Record<string, JsonValue> | null | undefined;

  return (
    <div className="space-y-6">
      <SectionCard title="AI Summary">
        {company.aiSummary ? (
          <p className="text-sm">{company.aiSummary}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No AI analysis has been generated yet
          </p>
        )}
      </SectionCard>

      <SectionCard title="Assessment Ratings">
        <div className="grid grid-cols-3 gap-4">
          <RatingField label="Digital Maturity" value={company.digitalMaturity} />
          <RatingField label="Safety Rating" value={company.safetyRating} />
          <RatingField label="Market Position" value={company.marketPosition} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="AI Capabilities">
          <JsonBadgeList data={company.aiCapabilities} />
        </SectionCard>
        <SectionCard title="AI Strengths">
          <JsonBadgeList data={company.aiStrengths} />
        </SectionCard>
      </div>

      {aiAnalysis?.performanceBenchmark && (
        <SectionCard title="Performance Benchmark">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(
              aiAnalysis.performanceBenchmark as Record<string, number>,
            ).map(([key, score]) => (
              <div key={key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                <span className="text-xs capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <span className="text-sm font-bold">{score}/100</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {aiAnalysis?.executiveSummary && (
        <SectionCard title="Executive Summary">
          <p className="text-sm">{String(aiAnalysis.executiveSummary)}</p>
        </SectionCard>
      )}
    </div>
  );
}

function SettingsTab({
  company,
  onCompanyUpdated,
}: {
  company: CompanyRecord;
  onCompanyUpdated: () => void;
}) {
  const [matchingLimit, setMatchingLimit] = useState(
    company.matchingRunsLimit != null ? String(company.matchingRunsLimit) : "",
  );
  const [analysisLimit, setAnalysisLimit] = useState(
    company.analysisRunsLimit != null ? String(company.analysisRunsLimit) : "",
  );
  const [saving, setSaving] = useState(false);
  const [matchingUsage, setMatchingUsage] = useState<UsageData | null>(null);
  const [analysisUsage, setAnalysisUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    setMatchingLimit(company.matchingRunsLimit != null ? String(company.matchingRunsLimit) : "");
    setAnalysisLimit(company.analysisRunsLimit != null ? String(company.analysisRunsLimit) : "");

    // Fetch current usage
    Promise.all([
      fetch(`/api/companies/${company.id}/matching-usage`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/companies/${company.id}/analysis-usage`).then((r) => r.ok ? r.json() : null),
    ]).then(([matching, analysis]) => {
      setMatchingUsage(matching);
      setAnalysisUsage(analysis);
    }).catch(() => {});
  }, [company.id, company.matchingRunsLimit, company.analysisRunsLimit]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const matchingVal = matchingLimit.trim() === "" ? null : parseInt(matchingLimit, 10);
      const analysisVal = analysisLimit.trim() === "" ? null : parseInt(analysisLimit, 10);

      if (matchingLimit.trim() !== "" && (isNaN(matchingVal!) || matchingVal! < 0)) {
        toast.error("Matching limit must be a non-negative number or blank for default.");
        return;
      }
      if (analysisLimit.trim() !== "" && (isNaN(analysisVal!) || analysisVal! < 0)) {
        toast.error("Analysis limit must be a non-negative number or blank for default.");
        return;
      }

      await api.adminUpdateCompany(company.id, {
        matching_runs_limit: matchingVal,
        analysis_runs_limit: analysisVal,
      });

      onCompanyUpdated();
      toast.success(`Usage limits updated for ${company.companyName}`);
    } catch (error) {
      console.error("Error updating limits:", error);
      toast.error("Failed to update usage limits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Per-Company Usage Overrides" icon={Zap}>
        <p className="text-xs text-muted-foreground mb-4">
          Set custom limits for this company. Leave blank to use the platform defaults.
        </p>

        <div className="space-y-4">
          {/* Matching Runs Limit */}
          <div className="flex items-center gap-4 p-3 border rounded-lg">
            <div className="flex-1">
              <Label htmlFor="matching-limit" className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Tender Matching Runs / Month
              </Label>
              {matchingUsage && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently used: {matchingUsage.used}/{matchingUsage.limit} this month
                  {matchingUsage.resetsAt && (
                    <> &middot; Resets {new Date(matchingUsage.resetsAt).toLocaleDateString()}</>
                  )}
                </p>
              )}
            </div>
            <Input
              id="matching-limit"
              type="number"
              min={0}
              placeholder="Default"
              value={matchingLimit}
              onChange={(e) => setMatchingLimit(e.target.value)}
              className="h-9 w-24 text-sm"
            />
          </div>

          {/* Analysis Runs Limit */}
          <div className="flex items-center gap-4 p-3 border rounded-lg">
            <div className="flex-1">
              <Label htmlFor="analysis-limit" className="text-sm font-medium flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                AI Analysis Runs / Month
              </Label>
              {analysisUsage && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently used: {analysisUsage.used}/{analysisUsage.limit} this month
                  {analysisUsage.resetsAt && (
                    <> &middot; Resets {new Date(analysisUsage.resetsAt).toLocaleDateString()}</>
                  )}
                </p>
              )}
            </div>
            <Input
              id="analysis-limit"
              type="number"
              min={0}
              placeholder="Default"
              value={analysisLimit}
              onChange={(e) => setAnalysisLimit(e.target.value)}
              className="h-9 w-24 text-sm"
            />
          </div>
        </div>

        <Separator className="my-4" />

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Overrides
        </Button>
      </SectionCard>
    </div>
  );
}

// =============================================================================
// Helper components
// =============================================================================

function RatingField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <p className="text-sm font-medium">{value || "Not assessed"}</p>
    </div>
  );
}

function JsonBadgeList({ data }: { data?: JsonValue }) {
  if (!data) {
    return <p className="text-sm text-muted-foreground italic">None</p>;
  }
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">None</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-xs">
          {String(item)}
        </Badge>
      ))}
    </div>
  );
}
