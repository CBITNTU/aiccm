import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Award, Lightbulb, MapPin, PoundSterling, Calendar, FileText, Users, ExternalLink, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: any;
  is_bookmarked: boolean;
  is_applied: boolean;
  created_at: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
}

interface TenderDetailDialogProps {
  result: MatchingResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
}

export function TenderDetailDialog({ result, open, onOpenChange, companyId }: TenderDetailDialogProps) {
  const navigate = useNavigate();
  const [tenderDetails, setTenderDetails] = React.useState<any>(null);
  const [taxonomies, setTaxonomies] = React.useState<Array<{ id: string; name: string }>>([]);

  // Fetch full tender details to get external_id for the correct link
  React.useEffect(() => {
    const fetchTenderDetails = async () => {
      if (!result?.tender_id) return;
      
      const { data, error } = await supabase
        .from('tenders')
        .select('reference_number, documents')
        .eq('id', result.tender_id)
        .maybeSingle();
      
      if (!error && data) {
        setTenderDetails(data);
      }

      // Fetch taxonomies
      const { data: taxData } = await supabase
        .from('tender_taxonomies')
        .select('taxonomy_id, taxonomies(id, name)')
        .eq('tender_id', result.tender_id);
      
      if (taxData) {
        setTaxonomies(taxData.map(tt => ({
          id: (tt.taxonomies as any)?.id || '',
          name: (tt.taxonomies as any)?.name || ''
        })).filter(t => t.name));
      }
    };
    
    if (open) {
      fetchTenderDetails();
    }
  }, [result?.tender_id, open]);

  if (!result) return null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  const handleApplySolo = () => {
    // Use the same URL format as the tender feed pages
    // Try to get the application URL from documents, otherwise construct from reference_number
    const applicationUrl = tenderDetails?.documents?.application_url;
    const referenceNumber = tenderDetails?.reference_number;
    
    const externalUrl = applicationUrl || 
      (referenceNumber ? `https://www.find-tender.service.gov.uk/Notice/${referenceNumber}?origin=SearchResults&p=1` : null);
    
    if (externalUrl) {
      window.open(externalUrl, '_blank');
    }
  };

  const handleBuildTeam = () => {
    // Navigate to consulting page with tender ID and company ID
    onOpenChange(false);
    navigate('/vo', { 
      state: { 
        tenderId: result.tender_id, 
        tenderTitle: result.tenders?.title,
        companyId: companyId
      } 
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <DialogTitle className="text-xl">{result.tenders?.title}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {result.tenders?.buyer} • {result.tenders?.location}
              </DialogDescription>
            </div>
            <Badge variant={getScoreVariant(result.overall_score)} className="text-lg px-3 py-1">
              {result.overall_score}% Match
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tender Description */}
          {/* Taxonomies */}
          {taxonomies.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tender Categories
              </h4>
              <div className="flex flex-wrap gap-2">
                {taxonomies.map((taxonomy) => (
                  <Badge key={taxonomy.id} variant="secondary">
                    {taxonomy.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {result.tenders?.description && (
            <div>
              <h4 className="font-medium mb-2">Description</h4>
              <p className="text-sm text-muted-foreground">{result.tenders.description}</p>
            </div>
          )}

          {/* Budget and Deadline */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.tenders?.budget_min && result.tenders?.budget_max && (
              <div className="flex items-center gap-2">
                <PoundSterling className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Budget Range</div>
                  <div className="font-semibold">
                    £{result.tenders.budget_min.toLocaleString()} - £{result.tenders.budget_max.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
            {result.tenders?.deadline && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Deadline</div>
                  <div className="font-semibold">
                    {new Date(result.tenders.deadline).toLocaleDateString()}
                  </div>
                </div>
              </div>
          )}
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button onClick={handleApplySolo} className="w-full" size="lg">
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Original Website
            </Button>
            <Button onClick={handleBuildTeam} variant="outline" className="w-full" size="lg">
              <Users className="w-4 h-4 mr-2" />
              Build Your Consulting Team
            </Button>
          </div>

          <Separator />

          {/* Score Breakdown */}
          <div>
            <h4 className="font-medium mb-4">Match Score Breakdown</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Capability</span>
                  <span className={getScoreColor(result.capability_score)}>
                    {result.capability_score}%
                  </span>
                </div>
                <Progress value={result.capability_score} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Experience</span>
                  <span className={getScoreColor(result.experience_score)}>
                    {result.experience_score}%
                  </span>
                </div>
                <Progress value={result.experience_score} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Location</span>
                  <span className={getScoreColor(result.location_score)}>
                    {result.location_score}%
                  </span>
                </div>
                <Progress value={result.location_score} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Certification</span>
                  <span className={getScoreColor(result.certification_score)}>
                    {result.certification_score}%
                  </span>
                </div>
                <Progress value={result.certification_score} className="h-2" />
              </div>
            </div>
          </div>

          <Separator />

          {/* AI Analysis Summary */}
          {result.ai_analysis?.summary && (
            <div>
              <h4 className="font-medium mb-2">AI Analysis Summary</h4>
              <p className="text-sm text-muted-foreground">{result.ai_analysis.summary}</p>
            </div>
          )}

          {/* Match Reasons */}
          {result.match_reasons && result.match_reasons.length > 0 && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Award className="h-4 w-4" />
                Key Strengths
              </h4>
              <div className="space-y-2">
                {result.match_reasons.map((reason, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvement Suggestions */}
          {result.improvement_suggestions && result.improvement_suggestions.length > 0 && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Improvement Suggestions
              </h4>
              <div className="space-y-2">
                {result.improvement_suggestions.map((suggestion, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                    <span>{suggestion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}