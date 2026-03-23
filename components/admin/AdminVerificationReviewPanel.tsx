"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import type { ReviewFeedback, JsonValue } from "@/lib/api/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ExternalLink,
  Mail,
  Phone,
  Globe,
  Building2,
  MapPin,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { AdminReviewFeedbackForm } from "./AdminReviewFeedbackForm";

interface AdminVerificationReviewPanelProps {
  requestId: string | null;
  onClose: () => void;
}

const CHECKLIST_ITEMS = [
  { id: "name", label: "Company name verified against official records" },
  { id: "website", label: "Website is accessible and matches company" },
  { id: "contact", label: "Contact details appear valid" },
  { id: "description", label: "Description is accurate and complete" },
  { id: "competencies", label: "Competencies and capabilities are reasonable" },
  { id: "compliance", label: "No compliance red flags identified" },
];

export function AdminVerificationReviewPanel({
  requestId,
  onClose,
}: AdminVerificationReviewPanelProps) {
  const queryClient = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminVerificationReview(requestId!),
    queryFn: () => api.adminGetVerificationReviewData(requestId!),
    enabled: !!requestId,
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      action,
      reviewNotes,
      reviewFeedback,
    }: {
      action: "approve" | "reject" | "request_changes";
      reviewNotes?: string;
      reviewFeedback?: ReviewFeedback;
    }) =>
      api.adminReviewVerification(requestId!, action, reviewNotes, reviewFeedback),
    onSuccess: (_, variables) => {
      const messages: Record<string, string> = {
        approve: "Company verified successfully",
        reject: "Verification request rejected",
        request_changes: "Changes requested — company has been notified",
      };
      toast.success(messages[variables.action]);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminVerificationRequests() });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to submit review");
    },
  });

  const allChecked = checkedItems.size === CHECKLIST_ITEMS.length;
  const isResubmission = (data?.previousRequests?.length ?? 0) > 0;
  const previousSnapshot = data?.previousRequests?.[0]?.companySnapshot as
    | Record<string, string>
    | undefined;
  const currentSnapshot = data?.request?.companySnapshot as
    | Record<string, string>
    | undefined;

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Sheet open={!!requestId} onOpenChange={() => onClose()}>
        <SheetContent
          side="right"
          className="w-[95vw] sm:max-w-[1200px] p-0 flex flex-col [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Company Verification Review</SheetTitle>
          <SheetDescription className="sr-only">Review company verification request details</SheetDescription>
          {isLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              Failed to load review data.
            </div>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className="px-6 py-4 border-b shrink-0">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg truncate">
                      {data.company.companyName}
                    </SheetTitle>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <StatusBadge status={data.request.status} />
                      {isResubmission && (
                        <Badge variant="outline" className="text-xs">
                          Resubmission #{(data.previousRequests?.length ?? 0) + 1}
                        </Badge>
                      )}
                      <span>
                        Submitted {new Date(data.request.createdAt).toLocaleDateString()}
                      </span>
                      {data.submitter && (
                        <span>
                          by {data.submitter.firstName} {data.submitter.lastName}
                          {data.submitter.jobTitle && ` (${data.submitter.jobTitle})`}
                        </span>
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
                    <TabsTrigger value="details">Company Details</TabsTrigger>
                    <TabsTrigger value="competencies">Competencies</TabsTrigger>
                    <TabsTrigger value="ai">AI Analysis</TabsTrigger>
                    <TabsTrigger value="financial">Financial & Compliance</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6">
                    <TabsContent value="overview" className="mt-0">
                      <OverviewTab
                        data={data}
                        checkedItems={checkedItems}
                        toggleCheck={toggleCheck}
                        isResubmission={isResubmission}
                        previousSnapshot={previousSnapshot}
                        currentSnapshot={currentSnapshot}
                      />
                    </TabsContent>

                    <TabsContent value="details" className="mt-0">
                      <CompanyDetailsTab data={data} />
                    </TabsContent>

                    <TabsContent value="competencies" className="mt-0">
                      <CompetenciesTab data={data} />
                    </TabsContent>

                    <TabsContent value="ai" className="mt-0">
                      <AIAnalysisTab data={data} />
                    </TabsContent>

                    <TabsContent value="financial" className="mt-0">
                      <FinancialTab data={data} />
                    </TabsContent>

                    <TabsContent value="history" className="mt-0">
                      <HistoryTab data={data} />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>

              {/* Sticky Footer */}
              {data.request.status === "pending" && (
                <div className="border-t px-6 py-4 flex items-center justify-between gap-3 shrink-0 bg-background">
                  <div className="text-sm text-muted-foreground">
                    {allChecked
                      ? "All checklist items verified"
                      : `${checkedItems.size}/${CHECKLIST_ITEMS.length} checklist items verified`}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowFeedbackForm(true)}
                      className="gap-1"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Request Changes
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setShowRejectDialog(true)}
                      className="gap-1"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => setShowApproveDialog(true)}
                      disabled={!allChecked}
                      className="gap-1"
                      title={
                        !allChecked
                          ? "Complete all checklist items before approving"
                          : undefined
                      }
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Approve Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Verification</DialogTitle>
            <DialogDescription>
              This will mark {data?.company.companyName} as a verified company.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={reviewMutation.isPending}
              onClick={() => {
                reviewMutation.mutate({ action: "approve" });
                setShowApproveDialog(false);
              }}
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification</DialogTitle>
            <DialogDescription>
              This will permanently reject the verification request. Use &quot;Request
              Changes&quot; instead if you want the company to fix issues and resubmit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reviewMutation.isPending}
              onClick={() => {
                reviewMutation.mutate({
                  action: "reject",
                  reviewNotes: rejectNotes || undefined,
                });
                setShowRejectDialog(false);
                setRejectNotes("");
              }}
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Feedback Form */}
      <AdminReviewFeedbackForm
        open={showFeedbackForm}
        onClose={() => setShowFeedbackForm(false)}
        onSubmit={(feedback) => {
          reviewMutation.mutate({
            action: "request_changes",
            reviewNotes: feedback.overallNotes || undefined,
            reviewFeedback: feedback,
          });
          setShowFeedbackForm(false);
        }}
        isPending={reviewMutation.isPending}
        companyName={data?.company.companyName ?? ""}
      />
    </>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "destructive" | "outline" | "secondary"; label: string }> = {
    pending: { variant: "outline", label: "Pending Review" },
    approved: { variant: "default", label: "Approved" },
    rejected: { variant: "destructive", label: "Rejected" },
    changes_requested: { variant: "secondary", label: "Changes Requested" },
  };
  const config = variants[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function DataField({
  label,
  value,
  changed,
  href,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  changed?: boolean;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={`space-y-1 ${changed ? "bg-amber-50 border border-amber-200 rounded p-2 -m-2" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {changed && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">
            Changed
          </Badge>
        )}
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

function OverviewTab({
  data,
  checkedItems,
  toggleCheck,
  isResubmission,
  previousSnapshot,
  currentSnapshot,
}: {
  data: ReviewData;
  checkedItems: Set<string>;
  toggleCheck: (id: string) => void;
  isResubmission: boolean;
  previousSnapshot?: Record<string, string>;
  currentSnapshot?: Record<string, string>;
}) {
  const changedFields = useMemo(() => {
    if (!isResubmission || !previousSnapshot || !currentSnapshot) return new Set<string>();
    const changed = new Set<string>();
    const allKeys = new Set([...Object.keys(previousSnapshot), ...Object.keys(currentSnapshot)]);
    for (const key of allKeys) {
      if (previousSnapshot[key] !== currentSnapshot[key]) {
        changed.add(key);
      }
    }
    return changed;
  }, [isResubmission, previousSnapshot, currentSnapshot]);

  return (
    <div className="space-y-6">
      {/* Submission Notes */}
      {data.request.submissionNotes && (
        <SectionCard title="Submission Notes" icon={FileText}>
          <p className="text-sm">{data.request.submissionNotes}</p>
        </SectionCard>
      )}

      {/* Previous Feedback (if resubmission) */}
      {isResubmission && data.previousRequests?.[0] && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Previous Review Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.previousRequests[0].reviewNotes && (
              <p className="text-sm text-amber-900">{data.previousRequests[0].reviewNotes}</p>
            )}
            {data.previousRequests[0].reviewFeedback && (
              <FeedbackDisplay feedback={data.previousRequests[0].reviewFeedback} />
            )}
            {changedFields.size > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-amber-700 mb-1">
                  Fields changed since last submission:
                </p>
                <div className="flex flex-wrap gap-1">
                  {Array.from(changedFields).map((field) => (
                    <Badge
                      key={field}
                      variant="outline"
                      className="text-xs bg-amber-100 text-amber-800 border-amber-300"
                    >
                      {formatFieldName(field)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Summary */}
      <SectionCard title="Quick Summary" icon={Building2}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label="Company Name" value={data.company.companyName} />
          <DataField
            label="Companies House"
            value={data.company.companiesHouseNumber}
            href={
              data.company.companiesHouseNumber
                ? `https://find-and-update.company-information.service.gov.uk/company/${data.company.companiesHouseNumber}`
                : undefined
            }
          />
          <DataField
            label="Website"
            value={data.company.websiteUrl}
            href={data.company.websiteUrl ?? undefined}
            icon={Globe}
          />
          <DataField label="Contact Email" value={data.company.contactEmail} icon={Mail} />
          <DataField label="Status" value={data.company.status} />
          <DataField
            label="Capabilities"
            value={`${data.capabilities.length} selected`}
          />
        </div>
      </SectionCard>

      {/* Review Checklist */}
      <SectionCard title="Review Checklist" icon={Shield}>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <Checkbox
                id={`check-${item.id}`}
                checked={checkedItems.has(item.id)}
                onCheckedChange={() => toggleCheck(item.id)}
              />
              <label
                htmlFor={`check-${item.id}`}
                className="text-sm cursor-pointer select-none"
              >
                {item.label}
              </label>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function CompanyDetailsTab({
  data,
}: {
  data: ReviewData;
}) {
  const company = data.company;
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

      <SectionCard title="Capabilities & Experience" icon={FileText}>
        <div className="space-y-4">
          <DataField label="Key Capabilities" value={company.keyCapabilities} />
          <Separator />
          <DataField label="Certifications" value={company.certifications ?? null} />
          <Separator />
          <DataField label="Equipment" value={company.equipment ?? null} />
          <Separator />
          <DataField label="Past Projects" value={company.pastProjects} />
        </div>
      </SectionCard>
    </div>
  );
}

function CompetenciesTab({
  data,
}: {
  data: ReviewData;
}) {
  // Group capabilities by category
  const groupedCapabilities = useMemo(() => {
    const groups: Record<string, { id: string; name: string }[]> = {};
    for (const cap of data.capabilities) {
      const category = cap.category || "Uncategorized";
      if (!groups[category]) groups[category] = [];
      groups[category].push(cap);
    }
    return groups;
  }, [data.capabilities]);

  // Group markets/standards hierarchically
  const groupedMarkets = useMemo(() => groupHierarchical(data.markets), [data.markets]);
  const groupedStandards = useMemo(() => groupHierarchical(data.standards), [data.standards]);

  return (
    <div className="space-y-6">
      <SectionCard title={`Capabilities (${data.capabilities.length})`}>
        {data.capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No capabilities selected</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedCapabilities).map(([category, caps]) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  {category}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {caps.map((cap) => (
                    <Badge key={cap.id} variant="outline" className="text-xs">
                      {cap.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Markets (${data.markets.length})`}>
        {data.markets.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No markets selected</p>
        ) : (
          <HierarchicalList items={groupedMarkets} />
        )}
      </SectionCard>

      <SectionCard title={`Standards & Certifications (${data.standards.length})`}>
        {data.standards.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No standards selected</p>
        ) : (
          <HierarchicalList items={groupedStandards} />
        )}
      </SectionCard>

      {/* AI-suggested competencies comparison */}
      {data.company.aiCompetencies && (
        <SectionCard title="AI-Suggested Competencies">
          <div className="flex flex-wrap gap-1.5">
            {(data.company.aiCompetencies as string[]).map((comp, i) => (
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

function AIAnalysisTab({
  data,
}: {
  data: ReviewData;
}) {
  const company = data.company;
  const aiAnalysis = company.aiAnalysis as Record<string, JsonValue> | null | undefined;

  return (
    <div className="space-y-6">
      {/* AI Summary */}
      <SectionCard title="AI Summary">
        {company.aiSummary ? (
          <p className="text-sm">{company.aiSummary}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No AI analysis has been generated yet
          </p>
        )}
      </SectionCard>

      {/* Assessment Ratings */}
      <SectionCard title="Assessment Ratings">
        <div className="grid grid-cols-3 gap-4">
          <RatingField label="Digital Maturity" value={company.digitalMaturity} />
          <RatingField label="Safety Rating" value={company.safetyRating} />
          <RatingField label="Market Position" value={company.marketPosition} />
        </div>
      </SectionCard>

      {/* AI Capabilities & Strengths */}
      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="AI Capabilities">
          <JsonBadgeList data={company.aiCapabilities} />
        </SectionCard>
        <SectionCard title="AI Strengths">
          <JsonBadgeList data={company.aiStrengths} />
        </SectionCard>
      </div>

      <SectionCard title="AI Certifications">
        <JsonBadgeList data={company.aiCertifications} />
      </SectionCard>

      {/* SWOT Analysis */}
      {aiAnalysis?.swotSummary && (
        <SectionCard title="SWOT Analysis">
          <SwotDisplay swot={aiAnalysis.swotSummary as Record<string, string[]>} />
        </SectionCard>
      )}

      {/* Performance Benchmark */}
      {aiAnalysis?.performanceBenchmark && (
        <SectionCard title="Performance Benchmark">
          <PerformanceBenchmarkDisplay
            benchmark={aiAnalysis.performanceBenchmark as Record<string, number>}
          />
        </SectionCard>
      )}

      {/* Executive Summary */}
      {aiAnalysis?.executiveSummary && (
        <SectionCard title="Executive Summary">
          <p className="text-sm">{String(aiAnalysis.executiveSummary)}</p>
        </SectionCard>
      )}
    </div>
  );
}

function FinancialTab({
  data,
}: {
  data: ReviewData;
}) {
  const company = data.company;
  const financialData = company.financialData as Record<string, JsonValue> | null;
  const complianceData = company.complianceData as Record<string, JsonValue> | null;
  const systemExtracted = company.systemExtracted as Record<string, JsonValue> | null;
  const humanVerified = company.humanVerified as Record<string, JsonValue> | null;

  const hasFinancial = financialData && Object.keys(financialData).length > 0;
  const hasCompliance = complianceData && Object.keys(complianceData).length > 0;
  const hasExtracted = systemExtracted && Object.keys(systemExtracted).length > 0;
  const hasVerified = humanVerified && Object.keys(humanVerified).length > 0;

  return (
    <div className="space-y-6">
      <SectionCard title="Financial Data">
        {hasFinancial ? (
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(financialData).map(([key, val]) => (
              <DataField
                key={key}
                label={formatFieldName(key)}
                value={formatJsonValue(val)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No financial data available</p>
        )}
      </SectionCard>

      <SectionCard title="Compliance Data">
        {hasCompliance ? (
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(complianceData).map(([key, val]) => (
              <DataField
                key={key}
                label={formatFieldName(key)}
                value={formatJsonValue(val)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No compliance data available</p>
        )}
      </SectionCard>

      <SectionCard title="System-Extracted Data">
        {hasExtracted ? (
          <div className="space-y-3">
            {Object.entries(systemExtracted).map(([key, val]) => (
              <div key={key}>
                <p className="text-xs font-medium text-muted-foreground">{formatFieldName(key)}</p>
                <pre className="text-xs mt-1 bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {typeof val === "object" ? JSON.stringify(val, null, 2) : String(val ?? "")}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No system-extracted data available</p>
        )}
      </SectionCard>

      {hasVerified && (
        <SectionCard title="Admin-Verified Fields">
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(humanVerified).map(([key, val]) => (
              <DataField
                key={key}
                label={formatFieldName(key)}
                value={formatJsonValue(val)}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function HistoryTab({
  data,
}: {
  data: ReviewData;
}) {
  const allRequests = [data.request, ...(data.previousRequests ?? [])];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        {allRequests.length} verification request{allRequests.length !== 1 ? "s" : ""}
      </h3>
      {allRequests.map((req, index) => (
        <Card key={req.id} className={index === 0 ? "border-blue-200" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={req.status} />
                {index === 0 && (
                  <Badge variant="outline" className="text-xs">
                    Current
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(req.createdAt).toLocaleDateString()}{" "}
                {new Date(req.createdAt).toLocaleTimeString()}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {req.submissionNotes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Submission Notes</p>
                <p className="text-sm mt-1">{req.submissionNotes}</p>
              </div>
            )}
            {req.reviewNotes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Review Notes</p>
                <p className="text-sm mt-1">{req.reviewNotes}</p>
              </div>
            )}
            {req.reviewFeedback && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Structured Feedback
                </p>
                <FeedbackDisplay feedback={req.reviewFeedback} />
              </div>
            )}
            {req.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                Reviewed on {new Date(req.reviewedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function FeedbackDisplay({ feedback }: { feedback: ReviewFeedback }) {
  const needsChanges = feedback.items.filter((i) => i.status === "needs_changes");
  if (needsChanges.length === 0 && !feedback.overallNotes) return null;

  return (
    <div className="space-y-2">
      {needsChanges.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded p-2"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium text-red-800">{item.label}:</span>{" "}
            <span className="text-red-700">{item.notes}</span>
          </div>
        </div>
      ))}
      {feedback.overallNotes && (
        <p className="text-sm text-muted-foreground">{feedback.overallNotes}</p>
      )}
    </div>
  );
}

function RatingField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="text-center p-3 bg-muted/50 rounded-lg">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-1">{value ?? "N/A"}</p>
    </div>
  );
}

function JsonBadgeList({ data }: { data: JsonValue | undefined }) {
  if (!data) return <p className="text-sm text-muted-foreground italic">Not available</p>;

  const items = Array.isArray(data) ? data : [];
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground italic">None found</p>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-xs">
          {typeof item === "string" ? item : JSON.stringify(item)}
        </Badge>
      ))}
    </div>
  );
}

function SwotDisplay({ swot }: { swot: Record<string, string[]> }) {
  const sections = [
    { key: "strengths", label: "Strengths", color: "text-emerald-700 bg-emerald-50" },
    { key: "weaknesses", label: "Weaknesses", color: "text-red-700 bg-red-50" },
    { key: "opportunities", label: "Opportunities", color: "text-blue-700 bg-blue-50" },
    { key: "threats", label: "Threats", color: "text-amber-700 bg-amber-50" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {sections.map(({ key, label, color }) => (
        <div key={key} className={`rounded-lg p-3 ${color}`}>
          <h5 className="text-xs font-medium mb-2">{label}</h5>
          <ul className="text-xs space-y-1 list-disc list-inside">
            {(swot[key] ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PerformanceBenchmarkDisplay({
  benchmark,
}: {
  benchmark: Record<string, number>;
}) {
  const metrics = Object.entries(benchmark).filter(([key]) => key !== "overallScore");

  return (
    <div className="space-y-3">
      {benchmark.overallScore !== undefined && (
        <div className="text-center p-3 bg-muted/50 rounded-lg mb-4">
          <p className="text-xs font-medium text-muted-foreground">Overall Score</p>
          <p className="text-2xl font-bold mt-1">{benchmark.overallScore}/10</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{formatFieldName(key)}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${(value / 10) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium w-6 text-right">{value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HierarchicalList({
  items,
}: {
  items: { parentName: string | null; children: { id: string; name: string }[] }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((group) => (
        <div key={group.parentName ?? "root"}>
          {group.parentName && (
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              {group.parentName}
            </h4>
          )}
          <div className="flex flex-wrap gap-1.5">
            {group.children.map((item) => (
              <Badge key={item.id} variant="outline" className="text-xs">
                {item.name}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Utility functions
// =============================================================================

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatJsonValue(val: JsonValue): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    // Handle {value, confidence, evidence} pattern
    const obj = val as Record<string, unknown>;
    if ("value" in obj) return String(obj.value);
    return JSON.stringify(val);
  }
  return String(val);
}

function groupHierarchical(
  items: { id: string; name: string; parentId: string | null }[],
): { parentName: string | null; children: { id: string; name: string }[] }[] {
  const parents = items.filter((i) => !i.parentId);
  const children = items.filter((i) => i.parentId);

  const groups: { parentName: string | null; children: { id: string; name: string }[] }[] = [];

  for (const parent of parents) {
    const childItems = children.filter((c) => c.parentId === parent.id);
    if (childItems.length > 0) {
      groups.push({ parentName: parent.name, children: childItems });
    } else {
      // Parent with no children listed as standalone
      groups.push({ parentName: null, children: [parent] });
    }
  }

  // Orphan children (parent not in selection)
  const assignedChildIds = new Set(groups.flatMap((g) => g.children.map((c) => c.id)));
  const orphans = children.filter((c) => !assignedChildIds.has(c.id));
  if (orphans.length > 0) {
    groups.push({ parentName: "Other", children: orphans });
  }

  return groups;
}

// Type for review data
type ReviewData = import("@/lib/api/types").VerificationReviewData;
