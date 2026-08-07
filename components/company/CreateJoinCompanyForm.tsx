"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  Mail,
  Phone,
  Search,
  Loader2,
  Users,
  Plus,
  CheckCircle,
  Globe,
  MapPin,
  Hash,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { useDeployment } from "@/lib/deployment/client";

interface CompanySearchResult {
  id: string;
  companyName: string;
  hasAdmin: boolean;
}

interface CreateJoinCompanyFormProps {
  userEmail: string;
  onSuccess?: (result: {
    action: "create" | "join";
    companyId?: string;
    companyName: string;
  }) => void;
  /** When set, switch to Join tab and pre-select this company (e.g. from directory ?join=id). */
  preselectedCompanyId?: string;
}

export function CreateJoinCompanyForm({
  userEmail,
  onSuccess,
  preselectedCompanyId,
}: CreateJoinCompanyFormProps) {
  const t = useTranslations("CompanyPage");
  const deployment = useDeployment();
  const _router = useRouter();
  void _router;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"create" | "join">(
    preselectedCompanyId ? "join" : "create",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create company form state
  const [createForm, setCreateForm] = useState({
    companyName: "",
    companiesHouseNumber: "",
    websiteUrl: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
  });

  // Companies House lookup state
  const [lookupState, setLookupState] = useState<{
    status: "idle" | "loading" | "success" | "error" | "not-found";
    data?: {
      companyName: string;
      companyNumber: string;
      registeredAddress: string;
      companyStatus: string;
    };
    error?: string;
  }>({ status: "idle" });

  // Join company form state
  const [joinForm, setJoinForm] = useState({
    searchQuery: "",
    selectedCompany: null as CompanySearchResult | null,
    message: "",
  });

  // Company search state
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Found existing company state (when duplicate detected during lookup)
  const [foundExistingCompany, setFoundExistingCompany] = useState<{
    id: string;
    companyName: string;
    hasAdmin: boolean;
  } | null>(null);
  const [foundCompanyMessage, setFoundCompanyMessage] = useState("");

  // Debounced company search
  const searchCompanies = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/search-companies?q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();

      if (data.companies) {
        setSearchResults(data.companies);
        setShowDropdown(true);
      }
    } catch (error) {
      console.error("Company search error:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce the search
  useEffect(() => {
    if (activeTab !== "join") return;

    const timer = setTimeout(() => {
      if (joinForm.searchQuery && !joinForm.selectedCompany) {
        searchCompanies(joinForm.searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    joinForm.searchQuery,
    joinForm.selectedCompany,
    activeTab,
    searchCompanies,
  ]);

  // Pre-select company when arriving from directory "Join this company" (e.g. ?join=companyId)
  useEffect(() => {
    if (!preselectedCompanyId || joinForm.selectedCompany?.id === preselectedCompanyId)
      return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getDirectoryCompany(preselectedCompanyId);
        const c = data?.company;
        if (cancelled || !c?.id) return;
        setJoinForm((prev) => ({
          ...prev,
          selectedCompany: {
            id: c.id as string,
            companyName: (c.companyName as string) ?? "",
            hasAdmin: false,
          },
        }));
      } catch {
        // Ignore: user can still search manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preselectedCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only preselectedCompanyId; joinForm.selectedCompany is set inside effect

  const handleSelectCompany = (company: CompanySearchResult) => {
    setJoinForm({
      ...joinForm,
      searchQuery: company.companyName,
      selectedCompany: company,
    });
    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setJoinForm({
      ...joinForm,
      searchQuery: "",
      selectedCompany: null,
    });
    setSearchResults([]);
  };

  // Companies House lookup handler
  const handleCompaniesHouseLookup = async () => {
    const companyNumber = createForm.companiesHouseNumber.trim();
    if (!companyNumber) return;

    setLookupState({ status: "loading" });

    try {
      const response = await fetch("/api/lookup-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyNumber }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        // Use the server's canonical number: padStart(8) here would mangle
        // letter-prefixed numbers like SC117119.
        const normalizedNumber = data.data.companyNumber ?? companyNumber;
        setLookupState({
          status: "success",
          data: {
            companyName: data.data.companyName,
            companyNumber: normalizedNumber,
            registeredAddress: data.data.registeredAddress,
            companyStatus: data.data.companyStatus,
          },
        });
        // Auto-fill the form with the lookup data
        setCreateForm((prev) => ({
          ...prev,
          companyName: data.data.companyName,
          companiesHouseNumber: normalizedNumber,
          address: data.data.registeredAddress,
        }));
        toast.success(t("createJoin.toastLookupSuccessTitle"), {
          description: t("createJoin.toastLookupSuccessDescription"),
        });
      } else if (data.errorCode === "DUPLICATE" && data.existingCompany) {
        // Company exists in database - offer to join
        setFoundExistingCompany({
          id: data.existingCompany.id,
          companyName: data.existingCompany.companyName,
          hasAdmin: data.existingCompany.hasAdmin,
        });
        setLookupState({ status: "idle" });
        return;
      } else if (data.errorCode === "NOT_FOUND") {
        setLookupState({
          status: "not-found",
          error: data.error || t("createJoin.lookupNotFound"),
        });
      } else {
        setLookupState({
          status: "error",
          error: data.error || t("createJoin.lookupFailed"),
        });
      }
    } catch (err) {
      console.error("Companies House lookup error:", err);
      setLookupState({
        status: "error",
        error: t("createJoin.lookupConnectionFailed"),
      });
    }
  };

  // Reset lookup state
  const handleResetLookup = () => {
    setLookupState({ status: "idle" });
    setFoundExistingCompany(null);
    setFoundCompanyMessage("");
    setCreateForm((prev) => ({
      ...prev,
      companyName: "",
      companiesHouseNumber: "",
      address: "",
    }));
  };

  // Handle request to join found existing company
  const handleRequestToJoinFoundCompany = async () => {
    if (!foundExistingCompany) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/company/create-or-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          companyId: foundExistingCompany.id,
          companyName: foundExistingCompany.companyName,
          message: foundCompanyMessage.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("createJoin.errorJoinSubmit"));
      }

      toast.success(t("createJoin.toastJoinRequestSubmittedTitle"), {
        description: t("createJoin.toastJoinRequestSubmittedDescription", {
          companyName: foundExistingCompany.companyName,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });

      onSuccess?.({
        action: "join",
        companyId: foundExistingCompany.id,
        companyName: foundExistingCompany.companyName,
      });
    } catch (error) {
      console.error("Error joining company:", error);
      const message =
        error instanceof Error ? error.message : t("createJoin.errorCreateRequest");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!createForm.companyName.trim()) {
      setError("Company name is required");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/company/create-or-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          companyName: createForm.companyName.trim(),
          companiesHouseNumber:
            createForm.companiesHouseNumber.trim() || undefined,
          websiteUrl: createForm.websiteUrl.trim() || undefined,
          address: createForm.address.trim() || undefined,
          contactEmail: createForm.contactEmail.trim() || undefined,
          contactPhone: createForm.contactPhone.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("createJoin.errorCreateSubmit"));
      }

      toast.success(t("createJoin.toastCompanyCreatedTitle"), {
        description: t("createJoin.toastCompanyCreatedDescription", {
          companyName: createForm.companyName,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });

      onSuccess?.({
        action: "create",
        companyId: data.companyId,
        companyName: createForm.companyName,
      });
    } catch (error) {
      console.error("Error creating company:", error);
      const message =
        error instanceof Error ? error.message : t("createJoin.errorCreateSubmit");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!joinForm.selectedCompany) {
      setError(t("createJoin.errorSelectCompany"));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/company/create-or-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          companyId: joinForm.selectedCompany.id,
          companyName: joinForm.selectedCompany.companyName,
          message: joinForm.message.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("createJoin.errorJoinSubmit"));
      }

      toast.success(t("createJoin.toastJoinRequestSubmittedTitle"), {
        description: t("createJoin.toastJoinRequestSubmittedDescription", {
          companyName: joinForm.selectedCompany.companyName,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });

      onSuccess?.({
        action: "join",
        companyId: joinForm.selectedCompany.id,
        companyName: joinForm.selectedCompany.companyName,
      });
    } catch (error) {
      console.error("Error joining company:", error);
      const message =
        error instanceof Error ? error.message : t("createJoin.errorCreateRequest");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <Card className="card-professional">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 dark:bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t("createJoin.title")}</CardTitle>
          <p className="text-muted-foreground mt-2">{t("createJoin.subtitle")}</p>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "create" | "join")}
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="create" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t("createJoin.tabs.create")}
              </TabsTrigger>
              <TabsTrigger value="join" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t("createJoin.tabs.join")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              {/* Show found existing company prompt */}
              {foundExistingCompany ? (
                <div className="space-y-4">
                  <div className="p-5 bg-amber-50 dark:bg-amber-600 rounded-lg border border-amber-200 dark:border-amber-600">
                    <div className="flex items-center gap-2 text-amber-200 mb-3">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">
                        {t("createJoin.foundCompany.bannerTitle")}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-amber-200 mb-1">
                      {foundExistingCompany.companyName}
                    </h3>
                    <p className="text-sm text-amber-200">
                      {t("createJoin.foundCompany.onPlatform")}{" "}
                      {foundExistingCompany.hasAdmin
                        ? t("createJoin.foundCompany.hasAdmin")
                        : t("createJoin.foundCompany.noAdmin")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="foundCompanyMessage">
                      {t("createJoin.foundCompany.messageLabel")}
                    </Label>
                    <Textarea
                      id="foundCompanyMessage"
                      placeholder={t("createJoin.foundCompany.messagePlaceholder")}
                      value={foundCompanyMessage}
                      onChange={(e) => setFoundCompanyMessage(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={handleRequestToJoinFoundCompany}
                      disabled={isLoading}
                      className="flex-1 btn-cta"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("createJoin.foundCompany.submitting")}
                        </>
                      ) : (
                        t("createJoin.foundCompany.requestJoin")
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetLookup}
                      disabled={isLoading}
                    >
                      {t("createJoin.foundCompany.goBack")}
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateCompany} className="space-y-4">
                  {/* Companies House Lookup Section */}
                  <div className="space-y-2">
                    <Label htmlFor="companiesHouseNumber">
                      {t("createJoin.create.chNumberLabel")}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="companiesHouseNumber"
                          type="text"
                          placeholder="e.g., 12345678 or SC123456"
                          value={createForm.companiesHouseNumber}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              // Letters are valid: SC/NI/OC/… prefixes.
                              // The server does the real validation.
                              companiesHouseNumber: e.target.value
                                .replace(/[^A-Za-z0-9]/g, "")
                                .toUpperCase()
                                .slice(0, 8),
                            })
                          }
                          className="pl-10"
                          maxLength={8}
                          disabled={
                            lookupState.status === "success" ||
                            lookupState.status === "loading"
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCompaniesHouseLookup}
                        disabled={
                          !createForm.companiesHouseNumber.trim() ||
                          lookupState.status === "loading" ||
                          lookupState.status === "success"
                        }
                      >
                        {lookupState.status === "loading" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          t("createJoin.create.lookUp")
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("createJoin.create.chHelper")}
                    </p>
                  </div>

                  {/* Lookup Success Card */}
                  {lookupState.status === "success" && lookupState.data && (
                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-green-800 dark:text-green-200">
                            {lookupState.data.companyName}
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            {t("createJoin.create.companyNumberLine", {
                              number: lookupState.data.companyNumber,
                              status: lookupState.data.companyStatus,
                            })}
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400 mt-1 truncate">
                            {lookupState.data.registeredAddress}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleResetLookup}
                          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 flex-shrink-0"
                        >
                          {t("createJoin.create.change")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lookup Error/Not Found */}
                  {(lookupState.status === "error" ||
                    lookupState.status === "not-found") && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            {lookupState.error}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            {t("createJoin.create.lookupManualHint")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleResetLookup}
                          className="text-amber-600 hover:text-amber-800 dark:text-amber-400 flex-shrink-0"
                        >
                          {t("createJoin.create.tryAgain")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {lookupState.status !== "success" && (
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          {lookupState.status === "idle"
                            ? t("createJoin.create.dividerManual")
                            : t("createJoin.create.dividerEnter")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Company Name - only editable if no lookup success */}
                  {lookupState.status !== "success" && (
                    <div className="space-y-2">
                      <Label htmlFor="companyName">{t("createJoin.create.companyNameLabel")}</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="companyName"
                          type="text"
                          placeholder={t("createJoin.create.companyNamePlaceholder")}
                          value={createForm.companyName}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              companyName: e.target.value,
                            })
                          }
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* Website URL */}
                  <div className="space-y-2">
                    <Label htmlFor="websiteUrl">{t("createJoin.create.websiteLabel")}</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="websiteUrl"
                        type="url"
                        placeholder={t("createJoin.create.websitePlaceholder")}
                        value={createForm.websiteUrl}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            websiteUrl: e.target.value,
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Address — always editable, including after a lookup: the
                      registered office can be stale or simply wrong, and hiding
                      the field leaves no way to correct it. */}
                  <div className="space-y-2">
                    <Label htmlFor="address">{t("createJoin.create.addressLabel")}</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="address"
                        type="text"
                        placeholder={t("createJoin.create.addressPlaceholder")}
                        value={createForm.address}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            address: e.target.value,
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Contact Email */}
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">{t("createJoin.create.emailLabel")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="contactEmail"
                        type="email"
                        placeholder={userEmail || t("createJoin.create.emailPlaceholderFallback")}
                        value={createForm.contactEmail}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            contactEmail: e.target.value,
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Defaults to your email if left empty
                    </p>
                  </div>

                  {/* Contact Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">{t("createJoin.create.phoneLabel")}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="contactPhone"
                        type="tel"
                        placeholder={deployment.verification.phonePlaceholder}
                        value={createForm.contactPhone}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            contactPhone: e.target.value,
                          })
                        }
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                    <p>{t("createJoin.create.afterApprovalNote")}</p>
                  </div>

                  {error && activeTab === "create" && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full btn-cta"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t("createJoin.create.creating")}
                      </>
                    ) : (
                      t("createJoin.create.submitCreate")
                    )}
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="join">
              <form onSubmit={handleJoinCompany} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="searchCompany">{t("createJoin.join.searchLabel")}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="searchCompany"
                      type="text"
                      placeholder={t("createJoin.join.searchPlaceholder")}
                      value={joinForm.searchQuery}
                      onChange={(e) => {
                        setJoinForm({
                          ...joinForm,
                          searchQuery: e.target.value,
                          selectedCompany: null,
                        });
                      }}
                      onFocus={() => {
                        if (
                          searchResults.length > 0 &&
                          !joinForm.selectedCompany
                        ) {
                          setShowDropdown(true);
                        }
                      }}
                      className="pl-10"
                      disabled={!!joinForm.selectedCompany}
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  {showDropdown && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                      {searchResults.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-accent flex items-center justify-between"
                          onClick={() => handleSelectCompany(company)}
                        >
                          <span className="font-medium">
                            {company.companyName}
                          </span>
                          {company.hasAdmin && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Has members
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {showDropdown &&
                    searchResults.length === 0 &&
                    joinForm.searchQuery.length >= 2 &&
                    !isSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg p-3">
                        <p className="text-sm text-muted-foreground">
                          {t("createJoin.join.noResults")}
                        </p>
                      </div>
                    )}
                </div>

                {/* Selected Company */}
                {joinForm.selectedCompany && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-md">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-green-800 dark:text-green-200">
                        {joinForm.selectedCompany.companyName}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {t("createJoin.join.selectedLabel")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                      className="text-green-600 hover:text-green-800"
                    >
                      {t("createJoin.join.change")}
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="joinMessage">
                    {t("createJoin.join.messageLabel")}
                  </Label>
                  <Textarea
                    id="joinMessage"
                    placeholder={t("createJoin.join.messagePlaceholder")}
                    value={joinForm.message}
                    onChange={(e) =>
                      setJoinForm({ ...joinForm, message: e.target.value })
                    }
                    rows={3}
                  />
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm">
                  <p className="text-amber-800 dark:text-amber-200">
                    Your request will be sent to the company administrator for
                    approval.
                  </p>
                </div>

                {error && activeTab === "join" && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full btn-cta"
                  disabled={isLoading || !joinForm.selectedCompany}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("createJoin.join.submitting")}
                    </>
                  ) : (
                    t("createJoin.join.requestJoin")
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
