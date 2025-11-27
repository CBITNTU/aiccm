import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Building2, Globe, Mail, Phone, MapPin, Award, Wrench, Users, FileText, Edit2, RefreshCw, ArrowLeft, DollarSign, TrendingUp, Save, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { hasOpenAIKey } from "@/lib/openai";
import OpenAIKeyDialog from "@/components/OpenAIKeyDialog";
import { TenderMatching } from "@/components/TenderMatching";
import BusinessChatbot from "@/components/BusinessChatbot";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CompanyTaxonomySelector } from "@/components/CompanyTaxonomySelector";
import UKCompaniesMap from "@/components/UKCompaniesMap";

type Company = Database['public']['Tables']['companies']['Row'];

const CompanyDetail = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { companyId } = useParams();
  const [showOpenAIDialog, setShowOpenAIDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<any>(null);
  
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
  const [editedEquipmentItems, setEditedEquipmentItems] = useState<string[]>([]);
  const [editedCertificationItems, setEditedCertificationItems] = useState<string[]>([]);
  const [editedProjectItems, setEditedProjectItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!user || !companyId) return;
      
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .eq('user_id', user.id) // Ensure user owns this company
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // No company found or user doesn't own it
            navigate('/profile');
            return;
          }
          throw error;
        }

        setCompanyData(data);
        
        // Load stored analysis if available
        if (data.ai_analysis) {
          setAnalysis(data.ai_analysis);
        } else {
          setAnalysis(null);
        }
      } catch (error) {
        console.error('Error fetching company data:', error);
        toast({
          title: "Error",
          description: "Failed to load company data",
          variant: "destructive"
        });
        navigate('/profile');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [user, companyId, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p className="text-muted-foreground">Company not found. Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleSaveField = async (field: string, value: string) => {
    if (!companyData) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ [field]: value })
        .eq('id', companyData.id);

      if (error) throw error;

      // Update local state
      setCompanyData({ ...companyData, [field]: value } as Company);
      
      toast({
        title: "Saved",
        description: "Changes saved successfully",
      });
      
      // Reset edit mode
      if (field === 'description' || field === 'key_capabilities') {
        setIsEditingOverview(false);
      } else if (field === 'equipment') {
        setIsEditingEquipment(false);
      } else if (field === 'certifications') {
        setIsEditingCertifications(false);
      } else if (field === 'past_projects') {
        setIsEditingProjects(false);
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOverview = async () => {
    if (!companyData) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ 
          description: editedDescription,
          key_capabilities: editedCapabilities
        })
        .eq('id', companyData.id);

      if (error) throw error;

      setCompanyData({ 
        ...companyData, 
        description: editedDescription,
        key_capabilities: editedCapabilities
      } as Company);
      
      toast({
        title: "Saved",
        description: "Overview updated successfully",
      });
      
      setIsEditingOverview(false);
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!companyData) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ 
          company_name: editedCompanyName.trim(),
          postcode: editedLocation.trim(),
          contact_email: editedEmail.trim(),
          website_url: editedWebsite.trim(),
          contact_phone: editedPhone.trim()
        })
        .eq('id', companyData.id);

      if (error) throw error;

      setCompanyData({ 
        ...companyData, 
        company_name: editedCompanyName.trim(),
        postcode: editedLocation.trim(),
        contact_email: editedEmail.trim(),
        website_url: editedWebsite.trim(),
        contact_phone: editedPhone.trim()
      } as Company);
      
      toast({
        title: "Saved",
        description: "Company information updated successfully",
      });
      
      setIsEditingBasicInfo(false);
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { companyId: companyData.id },
      });

      if (error) {
        throw new Error('Failed to analyze company');
      }

      if (data?.success && data?.analysis) {
        setAnalysis(data.analysis);
        
        // Refresh company data to get updated ai_analysis field
        const { data: updatedData, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyData.id)
          .single();
        
        if (fetchError) {
          console.error('Error fetching updated company data:', fetchError);
        } else if (updatedData) {
          setCompanyData(updatedData);
        }
        
        toast({
          title: "Analysis Complete",
          description: "Company profile analysis has been refreshed and saved successfully.",
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed", 
        description: error instanceof Error ? error.message : "Failed to analyze profile",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/profile')}
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
                      <p className="text-muted-foreground text-sm">Companies House: {companyData.companies_house_number}</p>
                    </div>
                  ) : (
                    <>
                      <CardTitle className="text-2xl font-bold text-foreground">{companyData.company_name}</CardTitle>
                      <p className="text-muted-foreground">Companies House: {companyData.companies_house_number}</p>
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
                      <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      {isAnalyzing ? 'Analyzing...' : analysis ? 'Re-analyze Company' : 'Analyze Company'}
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
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button 
                      size="sm"
                      onClick={handleSaveBasicInfo}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? 'Saving...' : 'Save'}
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
                  <span className="text-muted-foreground italic">No website added - click edit to add one</span>
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
                  <span className="text-foreground truncate">{companyData.contact_email}</span>
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
                  <span className="text-foreground">{companyData.contact_phone}</span>
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
                    <p className="text-base font-medium text-foreground whitespace-pre-line">
                      {companyData.address || companyData.postcode || 'Not specified'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="capabilities">Equipment</TabsTrigger>
            <TabsTrigger value="certifications">Certifications</TabsTrigger>
            <TabsTrigger value="projects">Past Projects</TabsTrigger>
            <TabsTrigger value="tenders">Tender Matches</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Company Location Map */}
            {(companyData.address || companyData.postcode) && (
              <div className="float-right ml-6 mb-6 w-96">
                <Card className="card-professional">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5" />
                      <span>Location</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UKCompaniesMap companyId={companyData.id} />
                  </CardContent>
                </Card>
              </div>
            )}

            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-5 h-5" />
                    <span>Company Overview</span>
                  </div>
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
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={handleSaveOverview}
                        disabled={isSaving}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Description</label>
                  {isEditingOverview ? (
                    <Textarea 
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      rows={5}
                      placeholder="Company description"
                    />
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">{companyData.description || "No description available"}</p>
                  )}
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Key Capabilities</label>
                  {isEditingOverview ? (
                    <Textarea 
                      value={editedCapabilities}
                      onChange={(e) => setEditedCapabilities(e.target.value)}
                      rows={3}
                      placeholder="Key capabilities (comma-separated)"
                    />
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">{companyData.key_capabilities || "No capabilities listed"}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Taxonomy Selector */}
            {companyData && <CompanyTaxonomySelector companyId={companyData.id} />}

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="card-professional">
                <CardHeader>
                  <CardTitle className="text-lg">Core Competencies</CardTitle>
                </CardHeader>
                 <CardContent>
                   <div className="flex flex-wrap gap-2">
                     {(() => {
                       // Use AI-generated coreCompetencies from analysis if available
                       let capabilities: string[] = [];
                       
                       if (analysis?.coreCompetencies && Array.isArray(analysis.coreCompetencies)) {
                         capabilities = analysis.coreCompetencies.filter(cap => typeof cap === 'string') as string[];
                       } else if (companyData.ai_competencies && Array.isArray(companyData.ai_competencies)) {
                         capabilities = companyData.ai_competencies.filter(comp => typeof comp === 'string') as string[];
                       } else if (companyData.key_capabilities) {
                         capabilities = companyData.key_capabilities.split(', ');
                       } else {
                         capabilities = [];
                       }
                       
                       return capabilities.map((competency: string, index: number) => (
                         <Badge key={index} variant="secondary">{competency}</Badge>
                       ));
                     })()}
                   </div>
                   {analysis && (
                     <p className="text-xs text-muted-foreground mt-2">
                       <span className="text-green-600">✨</span> AI-powered capability analysis
                     </p>
                   )}
                 </CardContent>
              </Card>

              <Card className="card-professional">
                <CardHeader>
                  <CardTitle className="text-lg">Business Insights</CardTitle>
                </CardHeader>
                 <CardContent>
                   <div className="space-y-4">
                     {/* Business Metrics */}
                      <div className="grid md:grid-cols-1 gap-3">
                        <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">Market Position</p>
                            <p className="text-xs text-muted-foreground">
                              {analysis?.marketPosition || companyData.market_position || 'Not assessed yet'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">Safety Rating</p>
                            <p className="text-xs text-muted-foreground">
                              {analysis?.safetyRating || companyData.safety_rating || 'Not assessed yet'}
                            </p>
                          </div>
                        </div>
                      </div>

                     <Separator />

                      {/* AI Analysis Section */}
                      {analysis && (
                        <div className="p-4 border border-border rounded-lg bg-card">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-primary" />
                              Latest AI Analysis
                            </p>
                            <Badge variant="outline">Overall Score: {analysis.performanceBenchmark?.overallScore}/100</Badge>
                          </div>
                          
                          {/* Business Insights */}
                          {analysis.businessInsights && Array.isArray(analysis.businessInsights) && analysis.businessInsights.length > 0 && (
                            <div className="mb-4">
                              <ul className="list-disc list-inside space-y-2">
                                {analysis.businessInsights.map((insight: string, index: number) => (
                                  <li key={index} className="text-xs text-muted-foreground leading-relaxed">{insight}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {/* Performance Metrics */}
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div className="text-center p-2 bg-secondary/30 rounded">
                              <div className="text-xs text-muted-foreground">Technical</div>
                              <div className="text-sm font-bold">{analysis.performanceBenchmark?.technicalExpertise}/100</div>
                            </div>
                            <div className="text-center p-2 bg-secondary/30 rounded">
                              <div className="text-xs text-muted-foreground">Innovation</div>
                              <div className="text-sm font-bold">{analysis.performanceBenchmark?.innovation}/100</div>
                            </div>
                            <div className="text-center p-2 bg-secondary/30 rounded">
                              <div className="text-xs text-muted-foreground">Experience</div>
                              <div className="text-sm font-bold">{analysis.performanceBenchmark?.projectExperience}/100</div>
                            </div>
                          </div>
                        </div>
                      )}
                     {!analysis && (
                       <div className="p-4 border border-dashed border-border rounded-lg bg-muted/50 text-center">
                         <p className="text-sm text-muted-foreground">No AI analysis available yet</p>
                         <p className="text-xs text-muted-foreground mt-1">Click "Analyze Company" to generate insights</p>
                       </div>
                     )}
                   </div>
                 </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* New Financial Tab */}
          <TabsContent value="financial" className="space-y-6">
            {companyData.financial_data && Object.keys(companyData.financial_data as any).length > 0 ? (
              <Card className="card-professional">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <DollarSign className="w-5 h-5" />
                    <span>Financial Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-6">
                    {Object.entries(companyData.financial_data as any).map(([key, field]: [string, any]) => (
                      <div key={key} className="p-6 bg-gradient-to-br from-secondary/30 to-secondary/10 rounded-lg border border-border">
                        <div className="text-sm font-medium text-muted-foreground capitalize mb-2">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-3xl font-bold text-foreground mb-2">
                          {field.value?.toLocaleString() || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {field.confidence >= 80 ? '🟢' : field.confidence >= 50 ? '🟡' : '⚪'}
                          Confidence: {field.confidence}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="card-professional">
                <CardContent className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Financial Data</h3>
                  <p className="text-muted-foreground">
                    Financial data was not extracted during onboarding. Add it manually or re-run the analysis.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="capabilities" className="space-y-6">
            {/* Equipment & Resources Section */}
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wrench className="w-5 h-5" />
                    <span>Equipment & Resources</span>
                  </div>
                  {!isEditingEquipment ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsEditingEquipment(true);
                        const items = companyData.equipment 
                          ? (companyData.equipment.includes(';') 
                              ? companyData.equipment.split(';')
                              : companyData.equipment.split(',')
                            ).map(item => item.trim()).filter(item => item)
                          : [''];
                        setEditedEquipmentItems(items);
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
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => {
                          const equipmentString = editedEquipmentItems.filter(item => item.trim()).join('; ');
                          handleSaveField('equipment', equipmentString);
                        }}
                        disabled={isSaving}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditingEquipment ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-2">Add or edit equipment items</p>
                    {editedEquipmentItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input 
                          value={item}
                          onChange={(e) => {
                            const newItems = [...editedEquipmentItems];
                            newItems[index] = e.target.value;
                            setEditedEquipmentItems(newItems);
                          }}
                          placeholder="Equipment item"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const newItems = editedEquipmentItems.filter((_, i) => i !== index);
                            setEditedEquipmentItems(newItems);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditedEquipmentItems([...editedEquipmentItems, ""])}
                    >
                      Add Item
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      if (!companyData.equipment) return <p className="text-muted-foreground">No equipment listed</p>;
                      
                      // Split by semicolon or comma
                      const items = companyData.equipment.includes(';') 
                        ? companyData.equipment.split(';')
                        : companyData.equipment.split(',');
                      
                      return items.map((item: string, index: number) => {
                        const trimmedItem = item.trim();
                        if (!trimmedItem) return null;
                        
                        return (
                          <div key={index} className="flex items-center space-x-3 p-3 bg-secondary/30 rounded-lg">
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                            <span className="text-foreground">{trimmedItem}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="certifications" className="space-y-6">
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Award className="w-5 h-5" />
                    <span>Certifications & Accreditations</span>
                  </div>
                  {!isEditingCertifications ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsEditingCertifications(true);
                        let items: string[] = [];
                        const aiAnalysis = companyData.ai_analysis as any;
                        if (aiAnalysis?.certifications && Array.isArray(aiAnalysis.certifications)) {
                          items = aiAnalysis.certifications.filter((cert: any) => typeof cert === 'string');
                        } else if (Array.isArray(companyData.ai_certifications)) {
                          items = (companyData.ai_certifications as any[]).filter(cert => typeof cert === 'string');
                        } else if (companyData.certifications) {
                          items = (companyData.certifications.includes(';') 
                            ? companyData.certifications.split(';')
                            : companyData.certifications.split(',')
                          ).map(item => item.trim()).filter(item => item);
                        }
                        setEditedCertificationItems(items.length > 0 ? items : ['']);
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
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => {
                          const certificationsString = editedCertificationItems.filter(item => item.trim()).join('; ');
                          handleSaveField('certifications', certificationsString);
                        }}
                        disabled={isSaving}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditingCertifications ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-2">Add or edit certifications</p>
                    {editedCertificationItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input 
                          value={item}
                          onChange={(e) => {
                            const newItems = [...editedCertificationItems];
                            newItems[index] = e.target.value;
                            setEditedCertificationItems(newItems);
                          }}
                          placeholder="Certification name"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const newItems = editedCertificationItems.filter((_, i) => i !== index);
                            setEditedCertificationItems(newItems);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditedCertificationItems([...editedCertificationItems, ""])}
                    >
                      Add Certification
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      if (!companyData.certifications) return <p className="text-muted-foreground">No certifications listed</p>;
                      
                      let certifications: string[] = [];
                      
                      // Check if ai_certifications exists in ai_analysis
                      const aiAnalysis = companyData.ai_analysis as any;
                      if (aiAnalysis?.certifications && Array.isArray(aiAnalysis.certifications)) {
                        certifications = aiAnalysis.certifications.filter((cert: any) => typeof cert === 'string');
                      } else if (Array.isArray(companyData.ai_certifications)) {
                        certifications = (companyData.ai_certifications as any[]).filter(cert => typeof cert === 'string');
                      } else {
                        // Split by semicolon or comma
                        certifications = companyData.certifications.includes(';')
                          ? companyData.certifications.split(';')
                          : companyData.certifications.split(',');
                      }
                      
                      return certifications.map((cert: string, index: number) => {
                        const trimmedCert = cert.trim();
                        if (!trimmedCert) return null;
                        
                        return (
                          <div key={index} className="flex items-center space-x-3 p-4 border border-border rounded-lg bg-card">
                            <Award className="w-5 h-5 text-primary flex-shrink-0" />
                            <span className="font-medium text-foreground">{trimmedCert}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
            <Card className="card-professional">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5" />
                    <span>Notable Past Projects</span>
                  </div>
                  {!isEditingProjects ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsEditingProjects(true);
                        const items = companyData.past_projects 
                          ? companyData.past_projects.split(/\n\n+/).filter(item => item.trim())
                          : [''];
                        setEditedProjectItems(items);
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
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => {
                          const projectsString = editedProjectItems.filter(item => item.trim()).join('\n\n');
                          handleSaveField('past_projects', projectsString);
                        }}
                        disabled={isSaving}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditingProjects ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-2">Add or edit past projects</p>
                    {editedProjectItems.map((item, index) => (
                      <div key={index} className="space-y-2 p-3 border border-border rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">Project {index + 1}</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const newItems = editedProjectItems.filter((_, i) => i !== index);
                              setEditedProjectItems(newItems);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <Textarea 
                          value={item}
                          onChange={(e) => {
                            const newItems = [...editedProjectItems];
                            newItems[index] = e.target.value;
                            setEditedProjectItems(newItems);
                          }}
                          placeholder="Project Title&#10;Project description and details..."
                          rows={4}
                        />
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditedProjectItems([...editedProjectItems, ""])}
                    >
                      Add Project
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {companyData.past_projects ? (
                      <Accordion type="single" collapsible className="w-full">
                        {companyData.past_projects.split(/\n\n+/).filter(item => item.trim()).map((project, index) => {
                          const trimmedProject = project.trim();
                          const lines = trimmedProject.split('\n');
                          const title = lines[0]; // First line is the title
                          const details = lines.slice(1).join('\n'); // Rest are details
                          return (
                            <AccordionItem key={index} value={`project-${index}`}>
                              <AccordionTrigger className="text-left">
                                <span className="font-medium">{title}</span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{details}</div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">No past projects recorded yet.</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tenders" className="space-y-6">
            <TenderMatching companyId={companyData.id} />
          </TabsContent>
        </Tabs>
      </div>
      
      <OpenAIKeyDialog 
        isOpen={showOpenAIDialog}
        onClose={() => setShowOpenAIDialog(false)}
        onKeySet={() => {
          setShowOpenAIDialog(false);
          handleRefreshAnalysis();
        }}
      />
      
      <BusinessChatbot companyData={companyData} />
    </div>
  );
};

export default CompanyDetail;