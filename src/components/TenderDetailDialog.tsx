import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Award, Lightbulb, MapPin, PoundSterling, Calendar, FileText, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MatchingResult {
  id: string;
  tender_id: string;
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
}

export function TenderDetailDialog({ result, open, onOpenChange }: TenderDetailDialogProps) {
  const navigate = useNavigate();

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
    // Navigate to tender detail page
    window.open(`https://www.contractsfinder.service.gov.uk/notice/${result.tender_id}`, '_blank');
  };

  const handleBuildTeam = () => {
    // Navigate to consulting page with tender ID
    onOpenChange(false);
    navigate('/vo', { state: { tenderId: result.tender_id, tenderTitle: result.tenders?.title } });
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
              <FileText className="w-4 h-4 mr-2" />
              Apply Solo
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