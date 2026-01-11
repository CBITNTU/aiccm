"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

interface CompanySearchResult {
  id: string;
  company_name: string;
  has_admin: boolean;
}

interface CompanyInfoStepProps {
  userEmail: string;
  onComplete: () => void;
}

export function CompanyInfoStep({ userEmail, onComplete }: CompanyInfoStepProps) {
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create company form state
  const [createForm, setCreateForm] = useState({
    companyName: "",
    contactEmail: "",
    contactPhone: "",
  });

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
        `/api/search-companies?q=${encodeURIComponent(query)}`
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
  }, [joinForm.searchQuery, joinForm.selectedCompany, activeTab, searchCompanies]);

  const handleSelectCompany = (company: CompanySearchResult) => {
    setJoinForm({
      ...joinForm,
      searchQuery: company.company_name,
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
      const response = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 4,
          data: {
            action: "create",
            companyName: createForm.companyName.trim(),
            contactEmail: createForm.contactEmail.trim() || undefined,
            contactPhone: createForm.contactPhone.trim() || undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create company");
      }

      toast.success("Company created!", {
        description: `"${createForm.companyName}" has been registered.`,
      });
      onComplete();
    } catch (error) {
      console.error("Error creating company:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create company";
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
      setError("Please select a company to join");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/onboarding/update-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 4,
          data: {
            action: "join",
            companyId: joinForm.selectedCompany.id,
            companyName: joinForm.selectedCompany.company_name,
            message: joinForm.message.trim() || undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit join request");
      }

      toast.success("Request submitted!", {
        description: `Your request to join "${joinForm.selectedCompany.company_name}" has been sent.`,
      });
      onComplete();
    } catch (error) {
      console.error("Error joining company:", error);
      const message =
        error instanceof Error ? error.message : "Failed to submit request";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <Card className="card-professional">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <CardTitle className="text-2xl">Company Information</CardTitle>
          <p className="text-muted-foreground mt-2">
            Register a new company or join an existing one
          </p>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "join")}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="create" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create New
              </TabsTrigger>
              <TabsTrigger value="join" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Join Existing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      type="text"
                      placeholder="Enter company name"
                      value={createForm.companyName}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, companyName: e.target.value })
                      }
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder={userEmail || "contact@company.com"}
                      value={createForm.contactEmail}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, contactEmail: e.target.value })
                      }
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Defaults to your email if left empty
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="contactPhone"
                      type="tel"
                      placeholder="+44 ..."
                      value={createForm.contactPhone}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, contactPhone: e.target.value })
                      }
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <p>
                    After approval, you&apos;ll be able to add more company details
                    including certifications, capabilities, and team members.
                  </p>
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
                      Creating...
                    </>
                  ) : (
                    "Create Company"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="join">
              <form onSubmit={handleJoinCompany} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="searchCompany">Search Company *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="searchCompany"
                      type="text"
                      placeholder="Search for a company..."
                      value={joinForm.searchQuery}
                      onChange={(e) => {
                        setJoinForm({
                          ...joinForm,
                          searchQuery: e.target.value,
                          selectedCompany: null,
                        });
                      }}
                      onFocus={() => {
                        if (searchResults.length > 0 && !joinForm.selectedCompany) {
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
                          <span className="font-medium">{company.company_name}</span>
                          {company.has_admin && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Has members
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {showDropdown && searchResults.length === 0 && joinForm.searchQuery.length >= 2 && !isSearching && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg p-3">
                      <p className="text-sm text-muted-foreground">
                        No companies found. Try a different search or create a new company.
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
                        {joinForm.selectedCompany.company_name}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Selected company
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                      className="text-green-600 hover:text-green-800"
                    >
                      Change
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="joinMessage">Message to Company Admin (optional)</Label>
                  <Textarea
                    id="joinMessage"
                    placeholder="Introduce yourself or explain why you want to join..."
                    value={joinForm.message}
                    onChange={(e) =>
                      setJoinForm({ ...joinForm, message: e.target.value })
                    }
                    rows={3}
                  />
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm">
                  <p className="text-amber-800 dark:text-amber-200">
                    Your request will be sent to the company administrator for approval.
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
                      Submitting...
                    </>
                  ) : (
                    "Request to Join"
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
