"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { api } from "@/lib/api/client";
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

type VerificationFilter = "all" | "unverified" | "pending" | "verified";

export function AdminCompanyManager() {
  const t = useTranslations("AdminCompanies");
  const verificationFilters: { value: VerificationFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "all", label: t("filters.all"), icon: Building2 },
    { value: "unverified", label: t("filters.unverified"), icon: CircleHelp },
    { value: "pending", label: t("filters.pending"), icon: Clock },
    { value: "verified", label: t("filters.verified"), icon: ShieldCheck },
  ];
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-tab search state
  const [userSearch, setUserSearch] = useState("");
  const [systemSearch, setSystemSearch] = useState("");

  // User companies filter
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");

  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async (): Promise<Company[]> => {
    try {
      const data = await api.adminListCompanies();
      const list = data.companies || [];
      setCompanies(list);
      return list;
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error(t("toasts.loadError"));
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    setDeleting(companyId);
    try {
      await api.adminDeleteCompany(companyId);
      toast.success(t("toasts.deleteSuccess", { name: companyName }));
      setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    } catch (error) {
      console.error("Error deleting company:", error);
      toast.error(t("toasts.deleteError", { name: companyName }));
    } finally {
      setDeleting(null);
    }
  };

  const handleCompanyUpdated = async () => {
    const refreshed = await fetchCompanies();
    if (selectedCompany) {
      const updated = refreshed.find((c) => c.id === selectedCompany.id);
      if (updated) setSelectedCompany(updated);
    }
  };

  const allUserCompanies = companies.filter((c) => !c.isSystemCompany);
  const allSystemCompanies = companies.filter((c) => c.isSystemCompany);

  // User companies: apply search + verification filter
  const filteredUserCompanies = allUserCompanies.filter((c) => {
    const matchesSearch =
      c.companyName.toLowerCase().includes(userSearch.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(userSearch.toLowerCase()));

    const matchesFilter =
      verificationFilter === "all" ||
      (verificationFilter === "verified" && c.verificationStatus === "verified") ||
      (verificationFilter === "pending" && c.verificationStatus === "pending") ||
      (verificationFilter === "unverified" &&
        (c.verificationStatus == null || c.verificationStatus === "unverified"));

    return matchesSearch && matchesFilter;
  });

  // System companies: apply search only
  const filteredSystemCompanies = allSystemCompanies.filter(
    (c) =>
      c.companyName.toLowerCase().includes(systemSearch.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(systemSearch.toLowerCase())),
  );

  // Counts for stats chips (based on ALL user companies, not filtered)
  const verifiedCount = allUserCompanies.filter((c) => c.verificationStatus === "verified").length;
  const pendingCount = allUserCompanies.filter((c) => c.verificationStatus === "pending").length;
  const unverifiedCount = allUserCompanies.filter(
    (c) => c.verificationStatus == null || c.verificationStatus === "unverified",
  ).length;

  if (loading) {
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
            <span className="font-medium text-foreground">{companies.length}</span> {t("stats.total")}
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="font-medium text-foreground">{allUserCompanies.length}</span> {t("stats.user")}
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="font-medium text-foreground">{allSystemCompanies.length}</span> {t("stats.system")}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="user-companies" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="user-companies" className="gap-2">
            <Users className="h-4 w-4" />
            {t("tabs.userCompanies")}
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {allUserCompanies.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="system-companies" className="gap-2">
            <Bot className="h-4 w-4" />
            {t("tabs.systemCompanies")}
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {allSystemCompanies.length}
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
              <span className="font-medium">{verifiedCount}</span>
              <span className="text-muted-foreground">{t("stats.verified")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium">{pendingCount}</span>
              <span className="text-muted-foreground">{t("stats.pending")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
              <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{unverifiedCount}</span>
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
          {filteredUserCompanies.length === 0 ? (
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
                {filteredUserCompanies.map((company) => (
                  <UserCompanyRow
                    key={company.id}
                    company={company}
                    deleting={deleting}
                    onSelect={setSelectedCompany}
                    onDelete={handleDeleteCompany}
                  />
                ))}
              </div>
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

          {filteredSystemCompanies.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("empty.noSystemCompanies")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredSystemCompanies.map((company) => (
                <SystemCompanyRow
                  key={company.id}
                  company={company}
                  deleting={deleting}
                  onDelete={handleDeleteCompany}
                />
              ))}
            </div>
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
  onDelete: (id: string, name: string) => void;
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
              onClick={() => onDelete(company.id, company.companyName)}
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
  onDelete: (id: string, name: string) => void;
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
              onClick={() => onDelete(company.id, company.companyName)}
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
  if (status === "pending") {
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
