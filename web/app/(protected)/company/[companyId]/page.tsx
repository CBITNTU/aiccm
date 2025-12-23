"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Award,
  Wrench,
  FileText,
  Edit2,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Save,
  X,
  Plus,
  Trash2,
  Tag,
  Target,
  Briefcase,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyTaxonomySelector } from "@/components/CompanyTaxonomySelector";
import { TenderMatching } from "@/components/tenders/TenderMatching";
import { TeamMembersCard } from "@/components/company/TeamMembersCard";
import { api } from "@/lib/api/client";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface Certification {
  name: string;
  issuer?: string;
  validUntil?: string;
}

interface Equipment {
  name: string;
  model?: string;
  capacity?: string;
}

interface PastProject {
  name: string;
  description?: string;
  value?: string;
  year?: string;
}

export default function CompanyDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.companyId as string;
  const currentTab = searchParams.get("tab") || "overview";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`/company/${companyId}?${params.toString()}`, { scroll: false });
  };

  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);

  // Edit states
  const [isEditingOverview, setIsEditingOverview] = useState(false);
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [isEditingEquipment, setIsEditingEquipment] = useState(false);
  const [isEditingCertifications, setIsEditingCertifications] = useState(false);
  const [isEditingProjects, setIsEditingProjects] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCapabilities, setEditedCapabilities] = useState("");
  const [editedCompanyName, setEditedCompanyName] = useState("");
  const [editedLocation, setEditedLocation] = useState("");
  const [editedEmail, setEditedEmail] = useState("");
  const [editedWebsite, setEditedWebsite] = useState("");
  const [editedPhone, setEditedPhone] = useState("");
  const [editedEquipment, setEditedEquipment] = useState<Equipment[]>([]);
  const [editedCertifications, setEditedCertifications] = useState<Certification[]>([]);
  const [editedProjects, setEditedProjects] = useState<PastProject[]>([]);

  // Initialize supabase client
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
      setLoading(false);
    }
  }, []);

  // Fetch company data
  useEffect(() => {
    if (!supabase || !user || !companyId) return;

    const fetchCompanyData = async () => {
      try {
        // First, check if user has access (owner or approved member)
        const isOwner = supabase
          .from("companies")
          .select("id")
          .eq("id", companyId)
          .eq("user_id", user.id)
          .single();

        const isMember = supabase
          .from("company_members")
          .select("company_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .eq("status", "approved")
          .single();

        const [ownerResult, memberResult] = await Promise.all([isOwner, isMember]);

        const hasAccess = !ownerResult.error || !memberResult.error;

        if (!hasAccess) {
          console.log("User has no access to this company");
          router.push("/profile");
          return;
        }

        // User has access, fetch full company data
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("id", companyId)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            router.push("/profile");
            return;
          }
          throw error;
        }

        setCompanyData(data);

        if (data.ai_analysis) {
          setAnalysis(data.ai_analysis as Record<string, unknown>);
        }
      } catch (error) {
        console.error("Error fetching company data:", error);
        toast.error("Failed to load company data");
        router.push("/profile");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [supabase, user, companyId, router]);

  const handleSaveOverview = async () => {
    if (!companyData || !supabase) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          description: editedDescription,
          key_capabilities: editedCapabilities,
        })
        .eq("id", companyData.id);

      if (error) throw error;

      setCompanyData({
        ...companyData,
        description: editedDescription,
        key_capabilities: editedCapabilities,
      });

      toast.success("Overview updated successfully");
      setIsEditingOverview(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!companyData || !supabase) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          company_name: editedCompanyName.trim(),
          postcode: editedLocation.trim(),
          contact_email: editedEmail.trim(),
          website_url: editedWebsite.trim(),
          contact_phone: editedPhone.trim(),
        })
        .eq("id", companyData.id);

      if (error) throw error;

      setCompanyData({
        ...companyData,
        company_name: editedCompanyName.trim(),
        postcode: editedLocation.trim(),
        contact_email: editedEmail.trim(),
        website_url: editedWebsite.trim(),
        contact_phone: editedPhone.trim(),
      });

      toast.success("Company information updated successfully");
      setIsEditingBasicInfo(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEquipment = async () => {
    if (!companyData || !supabase) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          equipment: JSON.stringify(editedEquipment),
        })
        .eq("id", companyData.id);

      if (error) throw error;

      setCompanyData({
        ...companyData,
        equipment: JSON.stringify(editedEquipment),
      });

      toast.success("Equipment updated successfully");
      setIsEditingEquipment(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCertifications = async () => {
    if (!companyData || !supabase) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          certifications: JSON.stringify(editedCertifications),
        })
        .eq("id", companyData.id);

      if (error) throw error;

      setCompanyData({
        ...companyData,
        certifications: JSON.stringify(editedCertifications),
      });

      toast.success("Certifications updated successfully");
      setIsEditingCertifications(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProjects = async () => {
    if (!companyData || !supabase) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          past_projects: JSON.stringify(editedProjects),
        })
        .eq("id", companyData.id);

      if (error) throw error;

      setCompanyData({
        ...companyData,
        past_projects: JSON.stringify(editedProjects),
      });

      toast.success("Projects updated successfully");
      setIsEditingProjects(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshAnalysis = async () => {
    if (!companyData || !supabase) return;

    setIsAnalyzing(true);
    try {
      const data = await api.analyzeCompany(companyData.id);

      if (data?.success && data?.analysis) {
        setAnalysis(data.analysis as Record<string, unknown>);

        const { data: updatedData } = await supabase
          .from("companies")
          .select("*")
          .eq("id", companyData.id)
          .single();

        if (updatedData) {
          setCompanyData(updatedData);
        }

        toast.success("Company profile analysis has been refreshed.");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to analyze profile"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading company details...</p>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-muted-foreground">Company not found. Redirecting...</p>
      </div>
    );
  }

  // Parse JSON fields
  let certifications: Certification[] = [];
  let equipment: Equipment[] = [];
  let pastProjects: PastProject[] = [];

  try {
    if (companyData.certifications) {
      certifications = JSON.parse(companyData.certifications);
    }
  } catch {
    // ignore
  }

  try {
    if (companyData.equipment) {
      equipment = JSON.parse(companyData.equipment);
    }
  } catch {
    // ignore
  }

  try {
    if (companyData.past_projects) {
      pastProjects = JSON.parse(companyData.past_projects);
    }
  } catch {
    // ignore
  }

  const financialData = companyData.financial_data as Record<
    string,
    { value: number; confidence: number }
  > | null;

  const aiCompetencies = companyData.ai_competencies as string[] | null;
  const aiCapabilities = companyData.ai_capabilities as string[] | null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/profile")}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Companies
        </Button>
      </div>

      {/* Company Header */}
      <Card className="card-professional mb-8">
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-16 h-16 gradient-hero rounded-lg flex items-center justify-center">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                {isEditingBasicInfo ? (
                  <div className="space-y-2">
                    <Input
                      value={editedCompanyName}
                      onChange={(e) => setEditedCompanyName(e.target.value)}
                      placeholder="Company Name"
                      className="text-xl font-bold"
                    />
                    <p className="text-muted-foreground text-sm">
                      Companies House:{" "}
                      {companyData.companies_house_number && (
                        <a
                          href={`https://find-and-update.company-information.service.gov.uk/company/${companyData.companies_house_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {companyData.companies_house_number}
                        </a>
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-2xl font-bold text-foreground">
                      {companyData.company_name}
                    </CardTitle>
                    <p className="text-muted-foreground">
                      Companies House:{" "}
                      {companyData.companies_house_number ? (
                        <a
                          href={`https://find-and-update.company-information.service.gov.uk/company/${companyData.companies_house_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {companyData.companies_house_number}
                        </a>
                      ) : (
                        <span className="italic">Not available</span>
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              {!isEditingBasicInfo ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditingBasicInfo(true);
                      setEditedCompanyName(companyData.company_name);
                      setEditedLocation(companyData.postcode || "");
                      setEditedEmail(companyData.contact_email || "");
                      setEditedWebsite(companyData.website_url || "");
                      setEditedPhone(companyData.contact_phone || "");
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Info
                  </Button>
                  <Button
                    className="btn-cta"
                    onClick={handleRefreshAnalysis}
                    disabled={isAnalyzing}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`}
                    />
                    {isAnalyzing
                      ? "Analyzing..."
                      : analysis
                      ? "Re-analyze"
                      : "Analyze Company"}
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingBasicInfo(false)}
                    disabled={isSaving}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveBasicInfo}
                    disabled={isSaving}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-center space-x-3">
              <Globe className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              {isEditingBasicInfo ? (
                <Input
                  value={editedWebsite}
                  onChange={(e) => setEditedWebsite(e.target.value)}
                  placeholder="Website URL"
                  type="url"
                />
              ) : companyData.website_url ? (
                <a
                  href={companyData.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate"
                >
                  {companyData.website_url}
                </a>
              ) : (
                <span className="text-muted-foreground italic">No website added</span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <Mail className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              {isEditingBasicInfo ? (
                <Input
                  value={editedEmail}
                  onChange={(e) => setEditedEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                />
              ) : (
                <span className="text-foreground truncate">
                  {companyData.contact_email || "Not specified"}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <Phone className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              {isEditingBasicInfo ? (
                <Input
                  value={editedPhone}
                  onChange={(e) => setEditedPhone(e.target.value)}
                  placeholder="Phone number"
                  type="tel"
                />
              ) : (
                <span className="text-foreground">
                  {companyData.contact_phone || "Not specified"}
                </span>
              )}
            </div>

            <div className="flex items-start space-x-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-1 flex-shrink-0" />
              {isEditingBasicInfo ? (
                <Input
                  value={editedLocation}
                  onChange={(e) => setEditedLocation(e.target.value)}
                  placeholder="Location/Postcode"
                />
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  {companyData.address || companyData.postcode ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        companyData.address || companyData.postcode || ""
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-medium text-primary hover:underline whitespace-pre-line cursor-pointer"
                    >
                      {companyData.address || companyData.postcode}
                    </a>
                  ) : (
                    <p className="text-base font-medium text-muted-foreground italic">
                      Not specified
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">
            <FileText className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="capabilities">
            <Wrench className="w-4 h-4 mr-2" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="projects">
            <Briefcase className="w-4 h-4 mr-2" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="w-4 h-4 mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="w-4 h-4 mr-2" />
            Financial
          </TabsTrigger>
          <TabsTrigger value="matches">
            <Target className="w-4 h-4 mr-2" />
            Matches
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <TrendingUp className="w-4 h-4 mr-2" />
            AI Analysis
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Company Overview</CardTitle>
                {!isEditingOverview ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingOverview(true);
                      setEditedDescription(companyData.description || "");
                      setEditedCapabilities(companyData.key_capabilities || "");
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingOverview(false)}
                      disabled={isSaving}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveOverview}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  {isEditingOverview ? (
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      placeholder="Company description..."
                      rows={4}
                    />
                  ) : (
                    <p className="text-muted-foreground">
                      {companyData.description || "No description available"}
                    </p>
                  )}
                </div>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-2">Key Capabilities</h4>
                  {isEditingOverview ? (
                    <Textarea
                      value={editedCapabilities}
                      onChange={(e) => setEditedCapabilities(e.target.value)}
                      placeholder="Key capabilities (comma-separated)..."
                      rows={3}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {companyData.key_capabilities
                        ?.split(",")
                        .map((cap, idx) => (
                          <Badge key={idx} variant="secondary">
                            {cap.trim()}
                          </Badge>
                        )) || (
                        <p className="text-muted-foreground">No capabilities listed</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Taxonomy Selector */}
            <CompanyTaxonomySelector companyId={companyId} />

            {/* Core Competencies */}
            {aiCompetencies && aiCompetencies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Core Competencies
                  </CardTitle>
                  <CardDescription>AI-identified strengths</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {aiCompetencies.map((comp, idx) => (
                      <Badge key={idx} variant="default">
                        {comp}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Business Insights */}
            {(companyData.market_position ||
              companyData.safety_rating ||
              companyData.digital_maturity) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Business Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {companyData.market_position && (
                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">Market Position</span>
                      <Badge variant="secondary">{companyData.market_position}</Badge>
                    </div>
                  )}
                  {companyData.safety_rating && (
                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">Safety Rating</span>
                      <Badge variant="default" className="bg-green-600">
                        {companyData.safety_rating}
                      </Badge>
                    </div>
                  )}
                  {companyData.digital_maturity && (
                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">Digital Maturity</span>
                      <Badge variant="secondary">{companyData.digital_maturity}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Capabilities Tab */}
        <TabsContent value="capabilities">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Certifications */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Certifications
                </CardTitle>
                {!isEditingCertifications ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingCertifications(true);
                      setEditedCertifications([...certifications]);
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingCertifications(false)}
                      disabled={isSaving}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveCertifications}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {isEditingCertifications ? (
                  <div className="space-y-3">
                    {editedCertifications.map((cert, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <Input
                            value={cert.name}
                            onChange={(e) => {
                              const updated = [...editedCertifications];
                              updated[idx].name = e.target.value;
                              setEditedCertifications(updated);
                            }}
                            placeholder="Certification name"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditedCertifications(
                                editedCertifications.filter((_, i) => i !== idx)
                              );
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          value={cert.issuer || ""}
                          onChange={(e) => {
                            const updated = [...editedCertifications];
                            updated[idx].issuer = e.target.value;
                            setEditedCertifications(updated);
                          }}
                          placeholder="Issuer"
                        />
                        <Input
                          value={cert.validUntil || ""}
                          onChange={(e) => {
                            const updated = [...editedCertifications];
                            updated[idx].validUntil = e.target.value;
                            setEditedCertifications(updated);
                          }}
                          placeholder="Valid until"
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        setEditedCertifications([
                          ...editedCertifications,
                          { name: "" },
                        ])
                      }
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Certification
                    </Button>
                  </div>
                ) : certifications.length > 0 ? (
                  <div className="space-y-3">
                    {certifications.map((cert, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg">
                        <p className="font-medium">{cert.name}</p>
                        {cert.issuer && (
                          <p className="text-sm text-muted-foreground">
                            Issuer: {cert.issuer}
                          </p>
                        )}
                        {cert.validUntil && (
                          <p className="text-sm text-muted-foreground">
                            Valid until: {cert.validUntil}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No certifications recorded</p>
                )}
              </CardContent>
            </Card>

            {/* Equipment */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Equipment
                </CardTitle>
                {!isEditingEquipment ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingEquipment(true);
                      setEditedEquipment([...equipment]);
                    }}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingEquipment(false)}
                      disabled={isSaving}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveEquipment}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {isEditingEquipment ? (
                  <div className="space-y-3">
                    {editedEquipment.map((eq, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                        <div className="flex justify-between">
                          <Input
                            value={eq.name}
                            onChange={(e) => {
                              const updated = [...editedEquipment];
                              updated[idx].name = e.target.value;
                              setEditedEquipment(updated);
                            }}
                            placeholder="Equipment name"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditedEquipment(
                                editedEquipment.filter((_, i) => i !== idx)
                              );
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          value={eq.model || ""}
                          onChange={(e) => {
                            const updated = [...editedEquipment];
                            updated[idx].model = e.target.value;
                            setEditedEquipment(updated);
                          }}
                          placeholder="Model"
                        />
                        <Input
                          value={eq.capacity || ""}
                          onChange={(e) => {
                            const updated = [...editedEquipment];
                            updated[idx].capacity = e.target.value;
                            setEditedEquipment(updated);
                          }}
                          placeholder="Capacity"
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        setEditedEquipment([...editedEquipment, { name: "" }])
                      }
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Equipment
                    </Button>
                  </div>
                ) : equipment.length > 0 ? (
                  <div className="space-y-3">
                    {equipment.map((eq, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg">
                        <p className="font-medium">{eq.name}</p>
                        {eq.model && (
                          <p className="text-sm text-muted-foreground">
                            Model: {eq.model}
                          </p>
                        )}
                        {eq.capacity && (
                          <p className="text-sm text-muted-foreground">
                            Capacity: {eq.capacity}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No equipment recorded</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Past Projects Tab */}
        <TabsContent value="projects">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5" />
                Past Projects
              </CardTitle>
              {!isEditingProjects ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingProjects(true);
                    setEditedProjects([...pastProjects]);
                  }}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingProjects(false)}
                    disabled={isSaving}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveProjects}
                    disabled={isSaving}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isEditingProjects ? (
                <div className="space-y-4">
                  {editedProjects.map((project, idx) => (
                    <div key={idx} className="p-4 bg-muted rounded-lg space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 space-y-2">
                          <Input
                            value={project.name}
                            onChange={(e) => {
                              const updated = [...editedProjects];
                              updated[idx].name = e.target.value;
                              setEditedProjects(updated);
                            }}
                            placeholder="Project name"
                          />
                          <Textarea
                            value={project.description || ""}
                            onChange={(e) => {
                              const updated = [...editedProjects];
                              updated[idx].description = e.target.value;
                              setEditedProjects(updated);
                            }}
                            placeholder="Project description"
                            rows={2}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={project.value || ""}
                              onChange={(e) => {
                                const updated = [...editedProjects];
                                updated[idx].value = e.target.value;
                                setEditedProjects(updated);
                              }}
                              placeholder="Project value"
                            />
                            <Input
                              value={project.year || ""}
                              onChange={(e) => {
                                const updated = [...editedProjects];
                                updated[idx].year = e.target.value;
                                setEditedProjects(updated);
                              }}
                              placeholder="Year"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditedProjects(
                              editedProjects.filter((_, i) => i !== idx)
                            );
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      setEditedProjects([...editedProjects, { name: "" }])
                    }
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Project
                  </Button>
                </div>
              ) : pastProjects.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {pastProjects.map((project, idx) => (
                    <AccordionItem key={idx} value={`project-${idx}`}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          <span>{project.name}</span>
                          {project.year && (
                            <Badge variant="secondary">{project.year}</Badge>
                          )}
                          {project.value && (
                            <Badge variant="outline">{project.value}</Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-muted-foreground">
                          {project.description || "No description available"}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-muted-foreground">No past projects recorded</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <TeamMembersCard companyId={companyId} variant="full" />
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Financial Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {financialData && Object.keys(financialData).length > 0 ? (
                <div className="grid md:grid-cols-3 gap-4">
                  {Object.entries(financialData).map(([key, field]) => (
                    <div key={key} className="p-4 bg-muted rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </div>
                      <div className="text-2xl font-bold mt-1">
                        {typeof field.value === "number"
                          ? `£${field.value.toLocaleString()}`
                          : "N/A"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Confidence: {field.confidence}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No financial data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tender Matches Tab */}
        <TabsContent value="matches">
          <TenderMatching companyId={companyId} />
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                AI-Generated Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysis ? (
                <div className="space-y-6">
                  {Object.entries(analysis).map(([key, value]) => (
                    <div key={key}>
                      <h4 className="font-semibold capitalize mb-2">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </h4>
                      {Array.isArray(value) ? (
                        <ul className="list-disc list-inside space-y-1">
                          {value.map((item, idx) => (
                            <li key={idx} className="text-muted-foreground">
                              {String(item)}
                            </li>
                          ))}
                        </ul>
                      ) : typeof value === "object" && value !== null ? (
                        <pre className="text-sm text-muted-foreground bg-muted p-3 rounded-lg overflow-x-auto">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-muted-foreground">{String(value)}</p>
                      )}
                      <Separator className="my-4" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No analysis available. Click &quot;Analyze Company&quot; to
                    generate AI insights.
                  </p>
                  <Button
                    className="btn-cta"
                    onClick={handleRefreshAnalysis}
                    disabled={isAnalyzing}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`}
                    />
                    {isAnalyzing ? "Analyzing..." : "Analyze Company"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
