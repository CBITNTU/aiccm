"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PastProjectsDisplay, formatPastProjectsValue } from "@/components/company/PastProjectsDisplay";
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

const CHECKLIST_ITEM_IDS = [
  "name",
  "website",
  "contact",
  "description",
  "competencies",
  "compliance",
] as const;

export function AdminVerificationReviewPanel({
  requestId,
  onClose,
}: AdminVerificationReviewPanelProps) {
  const t = useTranslations("AdminVerificationReview");
  const queryClient = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  // NOTE: State reset when switching companies is handled by the parent, which renders this
  // component with key={requestId}. When requestId changes, React unmounts and remounts the
  // component, so all state above initializes fresh — no useEffect reset needed here.

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
        approve: t("toasts.approveSuccess"),
        reject: t("toasts.rejectSuccess"),
        request_changes: t("toasts.changesRequestedSuccess"),
      };
      toast.success(messages[variables.action]);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminVerificationRequests() });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("toasts.submitFailed"));
    },
  });

  const isChangeReview = data?.request?.requestType === "change_review";
  const allChecked = isChangeReview || checkedItems.size === CHECKLIST_ITEM_IDS.length;
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
          <SheetTitle className="sr-only">{t("srTitle")}</SheetTitle>
          <SheetDescription className="sr-only">{t("srDescription")}</SheetDescription>
          {isLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              {t("loadFailed")}
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
                      {data.request.requestType === "change_review" && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                          {t("changeReviewBadge")}
                        </Badge>
                      )}
                      {isResubmission && (
                        <Badge variant="outline" className="text-xs">
                          {t("resubmissionBadge", { number: (data.previousRequests?.length ?? 0) + 1 })}
                        </Badge>
                      )}
                      <span>
                        {t("submittedOn", { date: new Date(data.request.createdAt).toLocaleDateString() })}
                      </span>
                      {data.submitter && (
                        <span>
                          {data.submitter.jobTitle
                            ? t("submittedByWithTitle", {
                                firstName: data.submitter.firstName ?? "",
                                lastName: data.submitter.lastName ?? "",
                                jobTitle: data.submitter.jobTitle,
                              })
                            : t("submittedBy", {
                                firstName: data.submitter.firstName ?? "",
                                lastName: data.submitter.lastName ?? "",
                              })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {/* Tabs Content */}
              <Tabs defaultValue={data.request.requestType === "change_review" ? "changes" : "overview"} className="flex-1 flex flex-col min-h-0">
                <div className="px-6 border-b shrink-0">
                  <TabsList className="h-10">
                    {data.request.requestType === "change_review" && (
                      <TabsTrigger value="changes">{t("tabs.changes")}</TabsTrigger>
                    )}
                    <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
                    <TabsTrigger value="details">{t("tabs.details")}</TabsTrigger>
                    <TabsTrigger value="competencies">{t("tabs.competencies")}</TabsTrigger>
                    <TabsTrigger value="ai">{t("tabs.ai")}</TabsTrigger>
                    <TabsTrigger value="financial">{t("tabs.financial")}</TabsTrigger>
                    <TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6">
                    {data.request.requestType === "change_review" && data.resolvedPendingChanges && (
                      <TabsContent value="changes" className="mt-0">
                        <ChangeReviewTab resolvedChanges={data.resolvedPendingChanges as Record<string, unknown>} />
                      </TabsContent>
                    )}

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
                      ? t("footer.allChecked")
                      : t("footer.partial", { checked: checkedItems.size, total: CHECKLIST_ITEM_IDS.length })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowFeedbackForm(true)}
                      className="gap-1"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("footer.requestChanges")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setShowRejectDialog(true)}
                      className="gap-1"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("footer.reject")}
                    </Button>
                    <Button
                      onClick={() => setShowApproveDialog(true)}
                      disabled={!allChecked}
                      className="gap-1"
                      title={
                        !allChecked
                          ? t("footer.approveDisabledTooltip")
                          : undefined
                      }
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {t("footer.approve")}
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
            <DialogTitle>{t("approveDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("approveDialog.description", { name: data?.company.companyName ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              {t("approveDialog.cancel")}
            </Button>
            <Button
              disabled={reviewMutation.isPending}
              onClick={() => {
                reviewMutation.mutate({ action: "approve" });
                setShowApproveDialog(false);
              }}
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("approveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("rejectDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={t("rejectDialog.placeholder")}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {t("rejectDialog.cancel")}
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
              {t("rejectDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Feedback Form — key resets form state every time it opens */}
      <AdminReviewFeedbackForm
        key={showFeedbackForm ? "open" : "closed"}
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
  const t = useTranslations("AdminVerificationReview");
  const variants: Record<string, { variant: "default" | "destructive" | "outline" | "secondary"; labelKey: string }> = {
    pending: { variant: "outline", labelKey: "statuses.pending" },
    approved: { variant: "default", labelKey: "statuses.approved" },
    rejected: { variant: "destructive", labelKey: "statuses.rejected" },
    changes_requested: { variant: "secondary", labelKey: "statuses.changesRequested" },
  };
  const config = variants[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  return <Badge variant={config.variant}>{t(config.labelKey)}</Badge>;
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
  const t = useTranslations("AdminVerificationReview");
  return (
    <div className={`space-y-1 ${changed ? "bg-amber-50 border border-amber-200 rounded p-2 -m-2" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {changed && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">
            {t("dataField.changed")}
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
        <p className="text-sm text-muted-foreground italic">{t("dataField.notProvided")}</p>
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

function ChangeReviewTab({ resolvedChanges }: { resolvedChanges: Record<string, unknown> }) {
  const t = useTranslations("AdminVerificationReview");
  const tCompanyPage = useTranslations("CompanyPage");
  const scalarFields = resolvedChanges.scalarFields as Record<string, { current: string | null; proposed: string | null }> | undefined;
  const capabilities = resolvedChanges.capabilities as {
    added: string[]; removed: string[];
    addedNames?: { name: string; category: string }[];
    removedNames?: { name: string; category: string }[];
  } | undefined;
  const markets = resolvedChanges.markets as {
    added: string[]; removed: string[];
    addedNames?: string[];
    removedNames?: string[];
  } | undefined;
  const standards = resolvedChanges.standards as {
    added: string[]; removed: string[];
    addedNames?: string[];
    removedNames?: string[];
  } | undefined;

  const fieldOrder = ["companyName", "description", "keyCapabilities", "certifications", "equipment", "pastProjects", "companiesHouseNumber"] as const;
  const fieldLabels: Record<string, string> = Object.fromEntries(
    fieldOrder.map((k) => [k, t(`changeReview.fields.${k}` as const)]),
  );

  const hasScalarChanges = scalarFields && Object.keys(scalarFields).length > 0;
  const hasCapChanges = capabilities && (capabilities.added.length > 0 || capabilities.removed.length > 0);
  const hasMarketChanges = markets && (markets.added.length > 0 || markets.removed.length > 0);
  const hasStdChanges = standards && (standards.added.length > 0 || standards.removed.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("changeReview.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasScalarChanges && !hasCapChanges && !hasMarketChanges && !hasStdChanges && (
            <p className="text-sm text-muted-foreground">{t("changeReview.empty")}</p>
          )}

          {/* Scalar field diffs */}
          {hasScalarChanges && fieldOrder.map((field) => {
            const change = scalarFields![field];
            if (!change) return null;
            const isPastProjects = field === "pastProjects";
            return (
              <div key={field} className="border rounded-lg p-4 space-y-2">
                <div className="text-sm font-medium">{fieldLabels[field] ?? field}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 font-medium">{t("changeReview.current")}</div>
                    <div className="text-sm bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-3 min-h-[2.5rem] whitespace-pre-wrap">
                      {isPastProjects ? formatPastProjectsValue(change.current, tCompanyPage) : (change.current || <span className="text-muted-foreground italic">{t("changeReview.emptyValue")}</span>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 font-medium">{t("changeReview.proposed")}</div>
                    <div className="text-sm bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 min-h-[2.5rem] whitespace-pre-wrap">
                      {isPastProjects ? formatPastProjectsValue(change.proposed, tCompanyPage) : (change.proposed || <span className="text-muted-foreground italic">{t("changeReview.emptyValue")}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Capability changes */}
          {hasCapChanges && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium">{t("changeReview.competencies")}</div>
              {capabilities!.addedNames && capabilities!.addedNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1 self-center">{t("changeReview.added")}</span>
                  {capabilities!.addedNames.map((cap, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-green-50 border-green-300 text-green-700">
                      + {typeof cap === "string" ? cap : cap.name}
                    </Badge>
                  ))}
                </div>
              )}
              {capabilities!.removedNames && capabilities!.removedNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1 self-center">{t("changeReview.removed")}</span>
                  {capabilities!.removedNames.map((cap, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-red-50 border-red-300 text-red-700">
                      - {typeof cap === "string" ? cap : cap.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Market changes */}
          {hasMarketChanges && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium">{t("changeReview.markets")}</div>
              {markets!.addedNames && markets!.addedNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1 self-center">{t("changeReview.added")}</span>
                  {markets!.addedNames.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-green-50 border-green-300 text-green-700">
                      + {name}
                    </Badge>
                  ))}
                </div>
              )}
              {markets!.removedNames && markets!.removedNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1 self-center">{t("changeReview.removed")}</span>
                  {markets!.removedNames.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-red-50 border-red-300 text-red-700">
                      - {name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Standard changes */}
          {hasStdChanges && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium">{t("changeReview.standards")}</div>
              {standards!.addedNames && standards!.addedNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1 self-center">{t("changeReview.added")}</span>
                  {standards!.addedNames.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-green-50 border-green-300 text-green-700">
                      + {name}
                    </Badge>
                  ))}
                </div>
              )}
              {standards!.removedNames && standards!.removedNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1 self-center">{t("changeReview.removed")}</span>
                  {standards!.removedNames.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-red-50 border-red-300 text-red-700">
                      - {name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
  const t = useTranslations("AdminVerificationReview");
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
        <SectionCard title={t("overview.submissionNotes")} icon={FileText}>
          <p className="text-sm">{data.request.submissionNotes}</p>
        </SectionCard>
      )}

      {/* Previous Feedback (if resubmission) */}
      {isResubmission && data.previousRequests?.[0] && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {t("overview.previousFeedback")}
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
                  {t("overview.changedFields")}
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
      <SectionCard title={t("overview.quickSummary")} icon={Building2}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label={t("fields.companyName")} value={data.company.companyName} />
          <DataField
            label={t("fields.companiesHouse")}
            value={data.company.companiesHouseNumber}
            href={
              data.company.companiesHouseNumber
                ? `https://find-and-update.company-information.service.gov.uk/company/${data.company.companiesHouseNumber}`
                : undefined
            }
          />
          <DataField
            label={t("fields.website")}
            value={data.company.websiteUrl}
            href={data.company.websiteUrl ?? undefined}
            icon={Globe}
          />
          <DataField label={t("fields.contactEmail")} value={data.company.contactEmail} icon={Mail} />
          <DataField label={t("fields.status")} value={data.company.status} />
          <DataField
            label={t("fields.capabilities")}
            value={t("overview.capabilitiesSelected", { count: data.capabilities.length })}
          />
        </div>
      </SectionCard>

      {/* Review Checklist */}
      <SectionCard title={t("overview.checklist")} icon={Shield}>
        <div className="space-y-3">
          {CHECKLIST_ITEM_IDS.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Checkbox
                id={`check-${id}`}
                checked={checkedItems.has(id)}
                onCheckedChange={() => toggleCheck(id)}
              />
              <label
                htmlFor={`check-${id}`}
                className="text-sm cursor-pointer select-none"
              >
                {t(`checklist.${id}` as const)}
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
  const t = useTranslations("AdminVerificationReview");
  const company = data.company;
  return (
    <div className="space-y-6">
      <SectionCard title={t("details.businessInfo")} icon={Building2}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label={t("fields.companyName")} value={company.companyName} />
          <DataField
            label={t("fields.companiesHouseNumber")}
            value={company.companiesHouseNumber}
            href={
              company.companiesHouseNumber
                ? `https://find-and-update.company-information.service.gov.uk/company/${company.companiesHouseNumber}`
                : undefined
            }
          />
          <div className="col-span-2">
            <DataField label={t("fields.description")} value={company.description ?? null} />
          </div>
          <DataField label={t("fields.address")} value={company.address ?? null} icon={MapPin} />
          <DataField label={t("fields.postcode")} value={company.postcode ?? null} />
        </div>
      </SectionCard>

      <SectionCard title={t("details.contactInfo")} icon={User}>
        <div className="grid grid-cols-2 gap-4">
          <DataField label={t("fields.contactPerson")} value={company.contactPerson} />
          <DataField
            label={t("fields.email")}
            value={company.contactEmail}
            href={company.contactEmail ? `mailto:${company.contactEmail}` : undefined}
            icon={Mail}
          />
          <DataField
            label={t("fields.phone")}
            value={company.contactPhone}
            href={company.contactPhone ? `tel:${company.contactPhone}` : undefined}
            icon={Phone}
          />
          <DataField
            label={t("fields.website")}
            value={company.websiteUrl}
            href={company.websiteUrl ?? undefined}
            icon={Globe}
          />
        </div>
      </SectionCard>

      <SectionCard title={t("details.capabilitiesExperience")} icon={FileText}>
        <div className="space-y-4">
          <DataField label={t("fields.keyCapabilities")} value={company.keyCapabilities} />
          <Separator />
          <DataField label={t("fields.certifications")} value={company.certifications ?? null} />
          <Separator />
          <DataField label={t("fields.equipment")} value={company.equipment ?? null} />
          <Separator />
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{t("fields.pastProjects")}</div>
            <PastProjectsDisplay value={company.pastProjects} />
          </div>
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
  const t = useTranslations("AdminVerificationReview");
  const uncategorizedLabel = t("competencies.uncategorized");
  // Group capabilities by category
  const groupedCapabilities = useMemo(() => {
    const groups: Record<string, { id: string; name: string }[]> = {};
    for (const cap of data.capabilities) {
      const category = cap.category || uncategorizedLabel;
      if (!groups[category]) groups[category] = [];
      groups[category].push(cap);
    }
    return groups;
  }, [data.capabilities, uncategorizedLabel]);

  // Group markets/standards hierarchically
  const otherLabel = t("competencies.other");
  const groupedMarkets = useMemo(() => groupHierarchical(data.markets, otherLabel), [data.markets, otherLabel]);
  const groupedStandards = useMemo(() => groupHierarchical(data.standards, otherLabel), [data.standards, otherLabel]);

  return (
    <div className="space-y-6">
      <SectionCard title={t("competencies.capabilitiesTitle", { count: data.capabilities.length })}>
        {data.capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("competencies.emptyCapabilities")}</p>
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

      <SectionCard title={t("competencies.marketsTitle", { count: data.markets.length })}>
        {data.markets.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("competencies.emptyMarkets")}</p>
        ) : (
          <HierarchicalList items={groupedMarkets} />
        )}
      </SectionCard>

      <SectionCard title={t("competencies.standardsTitle", { count: data.standards.length })}>
        {data.standards.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("competencies.emptyStandards")}</p>
        ) : (
          <HierarchicalList items={groupedStandards} />
        )}
      </SectionCard>

      {/* AI-suggested competencies comparison */}
      {data.company.aiCompetencies && (
        <SectionCard title={t("competencies.aiSuggested")}>
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
  const t = useTranslations("AdminVerificationReview");
  const company = data.company;
  const aiAnalysis = company.aiAnalysis as Record<string, JsonValue> | null | undefined;

  return (
    <div className="space-y-6">
      <SectionCard title={t("ai.summary")}>
        {company.aiSummary ? (
          <p className="text-sm">{company.aiSummary}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("ai.noSummary")}
          </p>
        )}
      </SectionCard>

      <SectionCard title={t("ai.ratings")}>
        <div className="grid grid-cols-3 gap-4">
          <RatingField label={t("ai.digitalMaturity")} value={company.digitalMaturity} />
          <RatingField label={t("ai.safetyRating")} value={company.safetyRating} />
          <RatingField label={t("ai.marketPosition")} value={company.marketPosition} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-6">
        <SectionCard title={t("ai.capabilities")}>
          <JsonBadgeList data={company.aiCapabilities} />
        </SectionCard>
        <SectionCard title={t("ai.strengths")}>
          <JsonBadgeList data={company.aiStrengths} />
        </SectionCard>
      </div>

      <SectionCard title={t("ai.certifications")}>
        <JsonBadgeList data={company.aiCertifications} />
      </SectionCard>

      {aiAnalysis?.swotSummary && (
        <SectionCard title={t("ai.swot")}>
          <SwotDisplay swot={aiAnalysis.swotSummary as Record<string, string[]>} />
        </SectionCard>
      )}

      {aiAnalysis?.performanceBenchmark && (
        <SectionCard title={t("ai.benchmark")}>
          <PerformanceBenchmarkDisplay
            benchmark={aiAnalysis.performanceBenchmark as Record<string, number>}
          />
        </SectionCard>
      )}

      {aiAnalysis?.executiveSummary && (
        <SectionCard title={t("ai.executiveSummary")}>
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
  const t = useTranslations("AdminVerificationReview");
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
      <SectionCard title={t("financial.financialData")}>
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
          <p className="text-sm text-muted-foreground italic">{t("financial.noFinancial")}</p>
        )}
      </SectionCard>

      <SectionCard title={t("financial.complianceData")}>
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
          <p className="text-sm text-muted-foreground italic">{t("financial.noCompliance")}</p>
        )}
      </SectionCard>

      <SectionCard title={t("financial.systemExtracted")}>
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
          <p className="text-sm text-muted-foreground italic">{t("financial.noExtracted")}</p>
        )}
      </SectionCard>

      {hasVerified && (
        <SectionCard title={t("financial.adminVerified")}>
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
  const t = useTranslations("AdminVerificationReview");
  const allRequests = [data.request, ...(data.previousRequests ?? [])];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        {allRequests.length === 1
          ? t("history.countOne", { count: allRequests.length })
          : t("history.countOther", { count: allRequests.length })}
      </h3>
      {allRequests.map((req, index) => (
        <Card key={req.id} className={index === 0 ? "border-blue-200" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={req.status} />
                {index === 0 && (
                  <Badge variant="outline" className="text-xs">
                    {t("history.current")}
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
                <p className="text-xs font-medium text-muted-foreground">{t("history.submissionNotes")}</p>
                <p className="text-sm mt-1">{req.submissionNotes}</p>
              </div>
            )}
            {req.reviewNotes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("history.reviewNotes")}</p>
                <p className="text-sm mt-1">{req.reviewNotes}</p>
              </div>
            )}
            {req.reviewFeedback && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t("history.structuredFeedback")}
                </p>
                <FeedbackDisplay feedback={req.reviewFeedback} />
              </div>
            )}
            {req.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                {t("history.reviewedOn", { date: new Date(req.reviewedAt).toLocaleDateString() })}
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
  const t = useTranslations("AdminVerificationReview");
  return (
    <div className="text-center p-3 bg-muted/50 rounded-lg">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-1">{value ?? t("ai.na")}</p>
    </div>
  );
}

function JsonBadgeList({ data }: { data: JsonValue | undefined }) {
  const t = useTranslations("AdminVerificationReview");
  if (!data) return <p className="text-sm text-muted-foreground italic">{t("ai.notAvailable")}</p>;

  const items = Array.isArray(data) ? data : [];
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground italic">{t("ai.noneFound")}</p>;

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
  const t = useTranslations("AdminVerificationReview");
  const sections = [
    { key: "strengths", label: t("ai.swotStrengths"), color: "text-emerald-700 bg-emerald-50" },
    { key: "weaknesses", label: t("ai.swotWeaknesses"), color: "text-red-700 bg-red-50" },
    { key: "opportunities", label: t("ai.swotOpportunities"), color: "text-blue-700 bg-blue-50" },
    { key: "threats", label: t("ai.swotThreats"), color: "text-amber-700 bg-amber-50" },
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
  const t = useTranslations("AdminVerificationReview");
  const metrics = Object.entries(benchmark).filter(([key]) => key !== "overallScore");

  return (
    <div className="space-y-3">
      {benchmark.overallScore !== undefined && (
        <div className="text-center p-3 bg-muted/50 rounded-lg mb-4">
          <p className="text-xs font-medium text-muted-foreground">{t("ai.overallScore")}</p>
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
  otherLabel: string,
): { parentName: string | null; children: { id: string; name: string }[] }[] {
  const parents = items.filter((i) => !i.parentId);
  const children = items.filter((i) => i.parentId);

  const groups: { parentName: string | null; children: { id: string; name: string }[] }[] = [];

  for (const parent of parents) {
    const childItems = children.filter((c) => c.parentId === parent.id);
    if (childItems.length > 0) {
      groups.push({ parentName: parent.name, children: childItems });
    } else {
      groups.push({ parentName: null, children: [parent] });
    }
  }

  const assignedChildIds = new Set(groups.flatMap((g) => g.children.map((c) => c.id)));
  const orphans = children.filter((c) => !assignedChildIds.has(c.id));
  if (orphans.length > 0) {
    groups.push({ parentName: otherLabel, children: orphans });
  }

  return groups;
}

// Type for review data
type ReviewData = import("@/lib/api/types").VerificationReviewData;
