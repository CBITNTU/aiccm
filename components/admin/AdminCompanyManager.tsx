"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type {
  AdminCompanyListParams,
  AdminCompanyListType,
  AdminCompanyStats,
  AdminCompanyVerificationStatus,
  CompanyRecord as Company,
} from "@/lib/api/types";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Trash2,
  Building2,
  AlertTriangle,
  Zap,
  Brain,
  Users,
  Bot,
  Upload,
  ShieldCheck,
  Clock,
  CircleHelp,
} from "lucide-react";
import { toast } from "sonner";
import { AdminCompanyDetailSheet } from "./AdminCompanyDetailSheet";
import { AdminCSVImport } from "./AdminCSVImport";
import { AdminDataImport } from "./AdminDataImport";
import { CompanyAIRegeneration } from "./CompanyAIRegeneration";
import { cn } from "@/lib/utils";

type VerificationFilter = AdminCompanyVerificationStatus;
type AdminCompanyTab = "user-companies" | "system-companies" | "import-tools";

const PAGE_SIZE = 25;
const EMPTY_STATS: AdminCompanyStats = {
  total: 0,
  user: 0,
  system: 0,
  verified: 0,
  pending: 0,
  unverified: 0,
};

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export function AdminCompanyManager() {
  const t = useTranslations("AdminCompanies");
  const verificationFilters: { value: VerificationFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "all", label: t("filters.all"), icon: Building2 },
    { value: "unverified", label: t("filters.unverified"), icon: CircleHelp },
    { value: "pending_verification", label: t("filters.pending"), icon: Clock },
    { value: "verified", label: t("filters.verified"), icon: ShieldCheck },
  ];
  const [activeTab, setActiveTab] = useState<AdminCompanyTab>("user-companies");

  const [userPage, setUserPage] = useState(1);

  const [systemPage, setSystemPage] = useState(1);

  // Per-tab search state
  const [userSearch, setUserSearch] = useState("");
  const [systemSearch, setSystemSearch] = useState("");
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const debouncedSystemSearch = useDebouncedValue(systemSearch, 300);

  // User companies filter
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");

  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const queryClient = useQueryClient();

  const userQueryParams: AdminCompanyListParams = {
    type: "user",
    page: userPage,
    pageSize: PAGE_SIZE,
    search: debouncedUserSearch,
    verificationStatus: verificationFilter,
  };

  const systemQueryParams: AdminCompanyListParams = {
    type: "system",
    page: systemPage,
    pageSize: PAGE_SIZE,
    search: debouncedSystemSearch,
  };

  const userCompaniesQuery = useQuery({
    queryKey: queryKeys.adminCompanies(userQueryParams),
    queryFn: () => api.adminListCompanies(userQueryParams),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const systemCompaniesQuery = useQuery({
    queryKey: queryKeys.adminCompanies(systemQueryParams),
    queryFn: () => api.adminListCompanies(systemQueryParams),
    enabled: activeTab === "system-companies",
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setUserPage(1);
  }, [debouncedUserSearch, verificationFilter]);

  useEffect(() => {
    setSystemPage(1);
  }, [debouncedSystemSearch]);

  useEffect(() => {
    if (userCompaniesQuery.isError) {
      console.error("Error fetching user companies:", userCompaniesQuery.error);
      toast.error(t("toasts.loadError"));
    }
  }, [t, userCompaniesQuery.error, userCompaniesQuery.isError]);

  useEffect(() => {
    if (systemCompaniesQuery.isError) {
      console.error("Error fetching system companies:", systemCompaniesQuery.error);
      toast.error(t("toasts.loadError"));
    }
  }, [t, systemCompaniesQuery.error, systemCompaniesQuery.isError]);

  const userData = userCompaniesQuery.data;
  const systemData = systemCompaniesQuery.data;
  const stats: AdminCompanyStats = userData?.stats ?? systemData?.stats ?? EMPTY_STATS;
  const userCompanies = userData?.companies ?? [];
  const systemCompanies = systemData?.companies ?? [];
  const userInitialLoading = userCompaniesQuery.isPending && !userData;
  const systemInitialLoading =
    activeTab === "system-companies" && systemCompaniesQuery.isPending && !systemData;
  const systemLoaded = !!systemData;
  const userTotalCount = userData?.totalCount ?? 0;
  const userTotalPages = userData?.totalPages ?? 0;
  const systemTotalCount = systemData?.totalCount ?? 0;
  const systemTotalPages = systemData?.totalPages ?? 0;

  const handleDeleteCompany = async (
    companyId: string,
    companyName: string,
    listType: AdminCompanyListType,
  ) => {
    setDeleting(companyId);
    try {
      await api.adminDeleteCompany(companyId);
      toast.success(t("toasts.deleteSuccess", { name: companyName }));
      if (listType === "system") {
        const nextPage = systemCompanies.length === 1 && systemPage > 1 ? systemPage - 1 : systemPage;
        if (nextPage !== systemPage) {
          setSystemPage(nextPage);
        }
      } else {
        const nextPage = userCompanies.length === 1 && userPage > 1 ? userPage - 1 : userPage;
        if (nextPage !== userPage) {
          setUserPage(nextPage);
        }
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.adminCompaniesRoot(),
      });
    } catch (error) {
      console.error("Error deleting company:", error);
      toast.error(t("toasts.deleteError", { name: companyName }));
    } finally {
      setDeleting(null);
    }
  };

  const handleCompanyUpdated = async () => {
    const refreshed = await userCompaniesQuery.refetch();
    if (selectedCompany) {
      const updated = refreshed.data?.companies.find((c) => c.id === selectedCompany.id);
      if (updated) setSelectedCompany(updated);
    }
  };

  if (userInitialLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">{t("loading")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("heading")}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{stats.total}</span> {t("stats.total")}
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="font-medium text-foreground">{stats.user}</span> {t("stats.user")}
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="font-medium text-foreground">{stats.system}</span> {t("stats.system")}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AdminCompanyTab)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="user-companies" className="gap-2">
            <Users className="h-4 w-4" />
            {t("tabs.userCompanies")}
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {stats.user}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="system-companies" className="gap-2">
            <Bot className="h-4 w-4" />
            {t("tabs.systemCompanies")}
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {stats.system}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="import-tools" className="gap-2">
            <Upload className="h-4 w-4" />
            {t("tabs.importTools")}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: User Companies ── */}
        <TabsContent value="user-companies" className="space-y-4">
          {/* Stats chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              <span className="font-medium">{stats.verified}</span>
              <span className="text-muted-foreground">{t("stats.verified")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium">{stats.pending}</span>
              <span className="text-muted-foreground">{t("stats.pending")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{stats.unverified}</span>
              <span className="text-muted-foreground">{t("stats.unverified")}</span>
            </div>
          </div>

          {/* Search + filter row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("search.userPlaceholder")}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Verification filter chips */}
            <div className="flex items-center gap-1 rounded-md border p-1">
              {verificationFilters.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setVerificationFilter(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    verificationFilter === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Company list */}
          {userInitialLoading ? (
            <CompanyListLoading label={t("loading")} />
          ) : userCompanies.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">{t("empty.noCompanies")}</p>
              {(userSearch || verificationFilter !== "all") && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("empty.noCompaniesHint")}
                </p>
              )}
            </div>
          ) : (
            <TooltipProvider>
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {userCompanies.map((company) => (
                  <UserCompanyRow
                    key={company.id}
                    company={company}
                    deleting={deleting}
                    onSelect={setSelectedCompany}
                    onDelete={handleDeleteCompany}
                  />
                ))}
              </div>
              <CompanyPagination
                page={userPage}
                pageSize={PAGE_SIZE}
                totalCount={userTotalCount}
                totalPages={userTotalPages}
                loading={userCompaniesQuery.isFetching}
                onPageChange={setUserPage}
              />
            </TooltipProvider>
          )}
        </TabsContent>

        {/* ── Tab 2: System / AI Companies ── */}
        <TabsContent value="system-companies" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("systemDescription")}
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("search.systemPlaceholder")}
              value={systemSearch}
              onChange={(e) => setSystemSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {systemInitialLoading ? (
            <CompanyListLoading label={t("loading")} />
          ) : systemLoaded && systemCompanies.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("empty.noSystemCompanies")}
              </p>
            </div>
          ) : systemLoaded ? (
            <>
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {systemCompanies.map((company) => (
                  <SystemCompanyRow
                    key={company.id}
                    company={company}
                    deleting={deleting}
                    onDelete={handleDeleteCompany}
                  />
                ))}
              </div>
              <CompanyPagination
                page={systemPage}
                pageSize={PAGE_SIZE}
                totalCount={systemTotalCount}
                totalPages={systemTotalPages}
                loading={systemCompaniesQuery.isFetching}
                onPageChange={setSystemPage}
              />
            </>
          ) : (
            <CompanyListLoading label={t("loading")} />
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("systemWarning")}
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* ── Tab 3: Import & Tools ── */}
        <TabsContent value="import-tools" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("importToolsDescription")}
            </p>
            <CompanyAIRegeneration />
          </div>
          <AdminCSVImport />
          <AdminDataImport />
        </TabsContent>
      </Tabs>

      {/* Company Detail Sheet — controlled from User Companies tab */}
      <AdminCompanyDetailSheet
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onCompanyUpdated={handleCompanyUpdated}
      />
    </div>
  );
}

function CompanyListLoading({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed py-12 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function CompanyPagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  loading,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("AdminCompanies");

  if (totalCount === 0 || totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {t("pagination.showingRange", { start, end, total: totalCount })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || loading}
        >
          {t("pagination.previous")}
        </Button>

        <div className="hidden items-center gap-1 sm:flex">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
            const shouldShow =
              pageNumber === 1 ||
              pageNumber === totalPages ||
              (pageNumber >= page - 1 && pageNumber <= page + 1);

            if (!shouldShow) {
              if (pageNumber === page - 2 || pageNumber === page + 2) {
                return (
                  <span key={pageNumber} className="px-2 text-sm text-muted-foreground">
                    ...
                  </span>
                );
              }
              return null;
            }

            return (
              <Button
                key={pageNumber}
                variant={pageNumber === page ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNumber)}
                disabled={loading}
                className="h-8 w-8 p-0"
              >
                {pageNumber}
              </Button>
            );
          })}
        </div>

        <span className="text-sm text-muted-foreground sm:hidden">
          {t("pagination.pageStatus", { page, totalPages })}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || loading}
        >
          {t("pagination.next")}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Row sub-components
// =============================================================================

function UserCompanyRow({
  company,
  deleting,
  onSelect,
  onDelete,
}: {
  company: Company;
  deleting: string | null;
  onSelect: (c: Company) => void;
  onDelete: (id: string, name: string, type: AdminCompanyListType) => void;
}) {
  const t = useTranslations("AdminCompanies");
  const verificationStatus = company.verificationStatus ?? "unverified";

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onSelect(company)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{company.companyName}</span>
          <VerificationBadge status={verificationStatus} />
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {company.postcode && <span>{company.postcode}</span>}
          {company.postcode && company.status && <span> · </span>}
          {company.status && <span className="capitalize">{company.status}</span>}
        </div>
      </div>

      {/* Usage limit badges */}
      <div className="flex items-center gap-2 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {company.matchingRunsLimit != null
                ? t("limits.perMonth", { count: company.matchingRunsLimit })
                : t("limits.default")}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              {company.matchingRunsLimit != null
                ? t("limits.matchingCustom", { count: company.matchingRunsLimit })
                : t("limits.matchingDefault")}
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center gap-1">
              <Brain className="h-3 w-3" />
              {company.analysisRunsLimit != null
                ? t("limits.perMonth", { count: company.analysisRunsLimit })
                : t("limits.default")}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              {company.analysisRunsLimit != null
                ? t("limits.analysisCustom", { count: company.analysisRunsLimit })
                : t("limits.analysisDefault")}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting === company.id}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("deleteUser.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("deleteUser.description", {
                name: company.companyName,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteUser.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(company.id, company.companyName, "user")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteUser.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SystemCompanyRow({
  company,
  deleting,
  onDelete,
}: {
  company: Company;
  deleting: string | null;
  onDelete: (id: string, name: string, type: AdminCompanyListType) => void;
}) {
  const t = useTranslations("AdminCompanies");
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{company.companyName}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {company.postcode}
          {company.description ? ` · ${company.description.substring(0, 80)}…` : ""}
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting === company.id}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("deleteSystem.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("deleteSystem.description", {
                name: company.companyName,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteSystem.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(company.id, company.companyName, "system")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteSystem.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// Verification badge helper
// =============================================================================

function VerificationBadge({ status }: { status: string }) {
  const t = useTranslations("AdminCompanies");
  if (status === "verified") {
    return (
      <Badge variant="default" className="text-[10px] h-4 px-1.5 gap-0.5">
        <ShieldCheck className="h-2.5 w-2.5" />
        {t("badges.verified")}
      </Badge>
    );
  }
  if (status === "pending_verification") {
    return (
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5 border-amber-400 text-amber-600">
        <Clock className="h-2.5 w-2.5" />
        {t("badges.pending")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
      {t("badges.unverified")}
    </Badge>
  );
}
