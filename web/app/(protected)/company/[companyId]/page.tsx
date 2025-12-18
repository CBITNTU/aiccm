"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { toast } from "sonner";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export default function CompanyDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);

  // Edit states
  const [isEditingOverview, setIsEditingOverview] = useState(false);
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCapabilities, setEditedCapabilities] = useState("");
  const [editedCompanyName, setEditedCompanyName] = useState("");
  const [editedLocation, setEditedLocation] = useState("");
  const [editedEmail, setEditedEmail] = useState("");
  const [editedWebsite, setEditedWebsite] = useState("");
  const [editedPhone, setEditedPhone] = useState("");

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
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("id", companyId)
          .eq("user_id", user.id)
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
        toast.error("Error", {
          description: "Failed to load company data",
        });
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

      toast.success("Saved", {
        description: "Overview updated successfully",
      });

      setIsEditingOverview(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Error", {
        description: "Failed to save changes",
      });
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

      toast.success("Saved", {
        description: "Company information updated successfully",
      });

      setIsEditingBasicInfo(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Error", {
        description: "Failed to save changes",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshAnalysis = async () => {
    if (!companyData || !supabase) return;

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "analyze-company",
        {
          body: { companyId: companyData.id },
        }
      );

      if (error) {
        throw new Error("Failed to analyze company");
      }

      if (data?.success && data?.analysis) {
        setAnalysis(data.analysis);

        // Refresh company data
        const { data: updatedData } = await supabase
          .from("companies")
          .select("*")
          .eq("id", companyData.id)
          .single();

        if (updatedData) {
          setCompanyData(updatedData);
        }

        toast.success("Analysis Complete", {
          description: "Company profile analysis has been refreshed.",
        });
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Analysis Failed", {
        description:
          error instanceof Error ? error.message : "Failed to analyze profile",
      });
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
        <p className="text-muted-foreground">
          Company not found. Redirecting...
        </p>
      </div>
    );
  }

  // Parse certifications and equipment from JSON strings
  let certifications: Array<{ name: string; issuer?: string; validUntil?: string }> = [];
  let equipment: Array<{ name: string; model?: string; capacity?: string }> = [];

  try {
    if (companyData.certifications) {
      certifications = JSON.parse(companyData.certifications);
    }
  } catch {
    // ignore parse errors
  }

  try {
    if (companyData.equipment) {
      equipment = JSON.parse(companyData.equipment);
    }
  } catch {
    // ignore parse errors
  }

  const financialData = companyData.financial_data as Record<
    string,
    { value: number; confidence: number }
  > | null;

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
                      ? "Re-analyze Company"
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
                <span className="text-muted-foreground italic">
                  No website added - click edit to add one
                </span>
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
                  {companyData.contact_email}
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
                  {companyData.contact_phone}
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
                    <p className="text-base font-medium text-muted-foreground whitespace-pre-line italic">
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
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <FileText className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="capabilities">
            <Wrench className="w-4 h-4 mr-2" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="w-4 h-4 mr-2" />
            Financial
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <TrendingUp className="w-4 h-4 mr-2" />
            AI Analysis
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
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
                      <p className="text-muted-foreground">
                        No capabilities listed
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Capabilities Tab */}
        <TabsContent value="capabilities">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {certifications.length > 0 ? (
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
                  <p className="text-muted-foreground">
                    No certifications recorded
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Equipment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {equipment.length > 0 ? (
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
                <p className="text-muted-foreground">
                  No financial data available
                </p>
              )}
            </CardContent>
          </Card>
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
                  {/* Display analysis sections */}
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
