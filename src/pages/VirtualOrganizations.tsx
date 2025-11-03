import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Users, 
  MessageCircle, 
  TrendingUp, 
  MapPin, 
  Building2, 
  Plus,
  Star,
  Send,
  Eye,
  UserPlus,
  Award,
  Target,
  Loader2,
  Mail,
  Phone,
  Globe
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Company = Database['public']['Tables']['companies']['Row'];

interface PartnerRecommendation {
  id: string;
  recommended_company_id: string;
  compatibility_score: number;
  complementary_capabilities: string[];
  shared_locations: string[];
  status: string;
  companies: Company;
}

interface VirtualOrganization {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  lead_company: Company;
  vo_members?: Array<{
    id: string;
    role: string;
    companies: Company;
  }>;
  tenders?: {
    title: string;
  };
}

interface PartnershipMessage {
  id: string;
  subject: string;
  message: string;
  created_at: string;
  read_at: string | null;
  from_company: Company;
  to_company: Company;
  tenders?: {
    title: string;
  };
}

const VirtualOrganizations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [recommendations, setRecommendations] = useState<PartnerRecommendation[]>([]);
  const [virtualOrgs, setVirtualOrgs] = useState<VirtualOrganization[]>([]);
  const [messages, setMessages] = useState<PartnershipMessage[]>([]);
  const [tenders, setTenders] = useState<any[]>([]);

  // Dialog states
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Company | null>(null);
  const [createVoDialogOpen, setCreateVoDialogOpen] = useState(false);

  // Form states
  const [messageForm, setMessageForm] = useState({
    subject: '',
    message: '',
    tender_id: ''
  });
  const [voForm, setVoForm] = useState({
    name: '',
    description: '',
    target_tender_id: ''
  });

  // Fetch user companies only once
  useEffect(() => {
    let isMounted = true;
    
    const fetchCompanies = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        if (error) {
          console.error('Error loading companies:', error);
          setCompanies([]);
        } else {
          setCompanies(data || []);
          // Auto-select first company
          if (data && data.length > 0) {
            setSelectedCompany(data[0]);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error('Network error loading companies:', error);
          setCompanies([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCompanies();
    
    return () => {
      isMounted = false;
    };
  }, [user?.id]); // Only depend on user.id

  // Fetch VO data when company is selected
  useEffect(() => {
    let isMounted = true;
    
    const fetchVoData = async () => {
      if (!selectedCompany) return;
      
      setLoading(true);
      
      try {
        // Load data with error tolerance
        const results = await Promise.allSettled([
          supabase.from('partnership_recommendations').select('*, companies!partnership_recommendations_recommended_company_id_fkey(*)').eq('company_id', selectedCompany.id).limit(10),
          supabase.from('virtual_organizations').select('*, lead_company:companies!virtual_organizations_lead_company_id_fkey(*)').limit(20),
          supabase.from('partnership_messages').select('*, from_company:companies!partnership_messages_from_company_id_fkey(*), to_company:companies!partnership_messages_to_company_id_fkey(*)').or(`from_company_id.eq.${selectedCompany.id},to_company_id.eq.${selectedCompany.id}`).limit(20),
          supabase.from('tenders').select('id, title, buyer, location, deadline').in('status', ['open', 'closing_soon']).limit(10)
        ]);

        if (!isMounted) return;
        
        // Handle results safely
        setRecommendations(results[0].status === 'fulfilled' ? results[0].value.data || [] : []);
        setVirtualOrgs(results[1].status === 'fulfilled' ? results[1].value.data || [] : []);
        setMessages(results[2].status === 'fulfilled' ? results[2].value.data || [] : []);
        setTenders(results[3].status === 'fulfilled' ? results[3].value.data || [] : []);
        
      } catch (error) {
        if (isMounted) {
          console.error('Error loading VO data:', error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchVoData();
    
    return () => {
      isMounted = false;
    };
  }, [selectedCompany?.id]); // Only depend on selectedCompany.id

  const handleSendMessage = async () => {
    if (!selectedPartner || !selectedCompany) return;

    try {
      const { error } = await supabase
        .from('partnership_messages')
        .insert({
          from_company_id: selectedCompany.id,
          to_company_id: selectedPartner.id,
          subject: messageForm.subject,
          message: messageForm.message,
          tender_id: messageForm.tender_id === 'none' ? null : messageForm.tender_id || null
        });

      if (error) throw error;

      toast.success('Message sent successfully!');
      setContactDialogOpen(false);
      setMessageForm({ subject: '', message: '', tender_id: '' });
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const handleCreateVO = async () => {
    if (!selectedCompany) return;

    try {
      const { data: vo, error: voError } = await supabase
        .from('virtual_organizations')
        .insert({
          name: voForm.name,
          description: voForm.description,
          lead_company_id: selectedCompany.id,
          target_tender_id: voForm.target_tender_id === 'none' ? null : voForm.target_tender_id || null,
          status: 'active'
        })
        .select()
        .single();

      if (voError) throw voError;

      // Add lead company as member
      await supabase
        .from('vo_members')
        .insert({
          vo_id: vo.id,
          company_id: selectedCompany.id,
          role: 'lead'
        });

      toast.success('Consulting Team created successfully!');
      setCreateVoDialogOpen(false);
      setVoForm({ name: '', description: '', target_tender_id: '' });
    } catch (error) {
      console.error('Error creating VO:', error);
      toast.error('Failed to create Consulting Team');
    }
  };

  const getCompatibilityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCompatibilityVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'outline';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            Loading consulting teams...
          </div>
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Companies Found</h3>
              <p className="text-muted-foreground mb-4">
                You need to create a company profile to build your consulting team
              </p>
              <Button onClick={() => window.location.href = '/onboarding'}>
                Create Company Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Build Your Consulting Team</h1>
          <p className="text-muted-foreground">
            Find potential partners, form consortiums, and collaborate on tenders with other companies.
          </p>
        </div>

        {/* Simple Company Selector */}
        {companies.length > 1 && (
          <div className="mb-6">
            <Label htmlFor="company-select">Select Company:</Label>
            <Select value={selectedCompany?.id || ""} onValueChange={(value) => {
              const company = companies.find(c => c.id === value);
              setSelectedCompany(company || null);
            }}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a company">
                  {selectedCompany ? selectedCompany.company_name : "Select a company"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs defaultValue="recommendations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="recommendations">Partner Recommendations</TabsTrigger>
            <TabsTrigger value="organizations">My Organizations</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="create">Create VO</TabsTrigger>
          </TabsList>

          {/* Partner Recommendations */}
          <TabsContent value="recommendations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Recommended Partners
                </CardTitle>
                <CardDescription>
                  Companies with complementary capabilities that could strengthen your tender applications
                </CardDescription>
              </CardHeader>
            </Card>

            {recommendations.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No recommendations available</h3>
                  <p className="text-muted-foreground">
                    Partner recommendations will appear here as more companies join the platform
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {recommendations.map((rec) => (
                  <Card key={rec.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                {rec.companies.company_name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-semibold">{rec.companies.company_name}</h3>
                              <div className="flex items-center text-sm text-muted-foreground">
                                <MapPin className="w-3 h-3 mr-1" />
                                {rec.companies.postcode}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {rec.companies.description}
                          </p>
                        </div>
                        <Badge variant={getCompatibilityVariant(rec.compatibility_score)} className="ml-4">
                          <Star className="w-3 h-3 mr-1" />
                          {rec.compatibility_score}% Match
                        </Badge>
                      </div>

                      {rec.complementary_capabilities && rec.complementary_capabilities.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium mb-2">Complementary Capabilities</h4>
                          <div className="flex flex-wrap gap-2">
                            {rec.complementary_capabilities.map((capability, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {capability}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <Separator className="my-4" />

                      <div className="flex justify-between items-center">
                        <div className="flex gap-2 text-sm text-muted-foreground">
                          {rec.companies.contact_email && (
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              Available
                            </div>
                          )}
                          {rec.companies.website_url && (
                            <div className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              Website
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPartner(rec.companies);
                              setContactDialogOpen(true);
                            }}
                          >
                            <MessageCircle className="w-4 h-4 mr-1" />
                            Contact
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Virtual Organizations */}
          <TabsContent value="organizations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  My Consulting Teams
                </CardTitle>
                <CardDescription>
                  Consortiums and partnerships you're part of
                </CardDescription>
              </CardHeader>
            </Card>

            {virtualOrgs.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No teams yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first consulting team to start collaborating
                  </p>
                  <Button onClick={() => setCreateVoDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Consulting Team
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {virtualOrgs.map((vo) => (
                  <Card key={vo.id}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">{vo.name}</h3>
                          <p className="text-muted-foreground mb-2">{vo.description}</p>
                          {vo.tenders && (
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Target className="w-3 h-3 mr-1" />
                              Target: {vo.tenders.title}
                            </div>
                          )}
                        </div>
                        <Badge variant={vo.status === 'active' ? 'default' : 'secondary'}>
                          {vo.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Led by {vo.lead_company.company_name}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Messages */}
          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Partnership Messages
                </CardTitle>
                <CardDescription>
                  Communications with potential partners
                </CardDescription>
              </CardHeader>
            </Card>

            {messages.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No messages yet</h3>
                  <p className="text-muted-foreground">
                    Messages from potential partners will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {messages.map((msg) => (
                  <Card key={msg.id} className={!msg.read_at ? "border-primary" : ""}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold">{msg.subject}</h3>
                          <p className="text-sm text-muted-foreground">
                            From: {msg.from_company.company_name}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(msg.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <p className="text-sm">{msg.message}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Create VO */}
          <TabsContent value="create" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create Consulting Team
                </CardTitle>
                <CardDescription>
                  Form a consortium for collaborative tendering
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="vo-name">Organization Name</Label>
                  <Input
                    id="vo-name"
                    value={voForm.name}
                    onChange={(e) => setVoForm({ ...voForm, name: e.target.value })}
                    placeholder="Enter organization name"
                  />
                </div>
                <div>
                  <Label htmlFor="vo-description">Description</Label>
                  <Textarea
                    id="vo-description"
                    value={voForm.description}
                    onChange={(e) => setVoForm({ ...voForm, description: e.target.value })}
                    placeholder="Describe the purpose and goals of this virtual organization"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="vo-tender">Target Tender (Optional)</Label>
                  <Select value={voForm.target_tender_id} onValueChange={(value) => setVoForm({ ...voForm, target_tender_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tender (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific tender</SelectItem>
                      {tenders.map((tender) => (
                        <SelectItem key={tender.id} value={tender.id}>
                          {tender.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleCreateVO} disabled={!voForm.name} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Consulting Team
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Contact Partner Dialog */}
        <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Contact {selectedPartner?.company_name}</DialogTitle>
              <DialogDescription>
                Send a message to explore partnership opportunities
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="message-subject">Subject</Label>
                <Input
                  id="message-subject"
                  value={messageForm.subject}
                  onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                  placeholder="Partnership inquiry"
                />
              </div>
              <div>
                <Label htmlFor="message-content">Message</Label>
                <Textarea
                  id="message-content"
                  value={messageForm.message}
                  onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
                  placeholder="Write your message here..."
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="related-tender">Related Tender (Optional)</Label>
                <Select value={messageForm.tender_id} onValueChange={(value) => setMessageForm({ ...messageForm, tender_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tender (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific tender</SelectItem>
                    {tenders.map((tender) => (
                      <SelectItem key={tender.id} value={tender.id}>
                        {tender.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setContactDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!messageForm.subject || !messageForm.message}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default VirtualOrganizations;