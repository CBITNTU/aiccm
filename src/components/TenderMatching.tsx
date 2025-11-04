import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Target, TrendingUp, MapPin, Eye, Loader2, Trash2, Building2, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { TenderDetailDialog } from "./TenderDetailDialog";
import { MatchingFilters } from "./MatchingFilters";
import { CompanySelector } from "./CompanySelector";

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

interface TenderMatchingProps {
  companyId?: string;
}

export function TenderMatching({ companyId }: TenderMatchingProps) {
  const { user } = useAuth();
  const [matchingResults, setMatchingResults] = useState<MatchingResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<MatchingResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(companyId || null);
  const [filters, setFilters] = useState<any>({
    sortBy: 'overall_score',
    sortDirection: 'desc',
    minScore: 0,
    maxScore: 100,
    showApplied: 'all'
  });

  useEffect(() => {
    // Set selectedCompanyId from prop if provided
    if (companyId) {
      setSelectedCompanyId(companyId);
    }
  }, [companyId]);

  useEffect(() => {
    if (user) {
      fetchMatchingResults();
    }
  }, [user, selectedCompanyId]); // Add selectedCompanyId as dependency to re-fetch when company changes

  // Apply filters and sorting whenever results or filters change
  useEffect(() => {
    applyFiltersAndSorting();
  }, [matchingResults, filters]);

  const applyFiltersAndSorting = () => {
    let filtered = [...matchingResults];

    // Apply score range filter
    filtered = filtered.filter(result => 
      result.overall_score >= (filters.minScore || 0) && 
      result.overall_score <= (filters.maxScore || 100)
    );

    // Apply status filter
    if (filters.showApplied === 'applied') {
      filtered = filtered.filter(result => result.is_applied);
    } else if (filters.showApplied === 'not_applied') {
      filtered = filtered.filter(result => !result.is_applied);
    } else if (filters.showApplied === 'bookmarked') {
      filtered = filtered.filter(result => result.is_bookmarked);
    }

    // Apply quick filters
    if (filters.quickFilter === 'high_score') {
      filtered = filtered.filter(result => result.overall_score >= 80);
    } else if (filters.quickFilter === 'urgent') {
      filtered = filtered.filter(result => {
        if (!result.tenders.deadline) return false;
        const deadline = new Date(result.tenders.deadline);
        const today = new Date();
        const daysDiff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff <= 7 && daysDiff >= 0;
      });
    } else if (filters.quickFilter === 'high_value') {
      filtered = filtered.filter(result => 
        (result.tenders.budget_max || result.tenders.budget_min || 0) >= 1000000
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (filters.sortBy) {
        case 'overall_score':
        case 'capability_score':
        case 'experience_score':
        case 'location_score':
        case 'certification_score':
          aValue = a[filters.sortBy] || 0;
          bValue = b[filters.sortBy] || 0;
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'deadline':
          aValue = a.tenders.deadline ? new Date(a.tenders.deadline).getTime() : 0;
          bValue = b.tenders.deadline ? new Date(b.tenders.deadline).getTime() : 0;
          break;
        case 'budget':
          aValue = a.tenders.budget_max || a.tenders.budget_min || 0;
          bValue = b.tenders.budget_max || b.tenders.budget_min || 0;
          break;
        default:
          aValue = a.overall_score;
          bValue = b.overall_score;
      }

      return filters.sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
    });

    setFilteredResults(filtered);
  };

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const resetFilters = () => {
    setFilters({
      sortBy: 'overall_score',
      sortDirection: 'desc',
      minScore: 0,
      maxScore: 100,
      showApplied: 'all'
    });
  };

  const fetchMatchingResults = async () => {
    setLoading(true);
    try {
      // Only fetch results if a specific company is selected
      if (!selectedCompanyId) {
        setMatchingResults([]);
        return;
      }

      const { data, error } = await supabase
        .from('matching_results')
        .select(`
          *,
          tenders (
            title,
            buyer,
            description,
            location,
            deadline,
            budget_min,
            budget_max
          )
        `)
        .eq('company_id', selectedCompanyId);

      if (error) throw error;
      setMatchingResults(data || []);
    } catch (error) {
      console.error('Error fetching matching results:', error);
      toast.error('Failed to fetch matching results');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!selectedCompanyId) {
      toast.error('Please select a company to analyze');
      return;
    }

    setAnalyzing(true);
    try {
      console.log('Starting analysis with companyId:', selectedCompanyId);
      
      // Pass selectedCompanyId to the edge function
      const { data, error } = await supabase.functions.invoke('match-tenders', {
        body: { companyId: selectedCompanyId }
      });
      
      if (error) {
        console.error('Analysis error:', error);
        throw error;
      }
      
      console.log('Analysis response:', data);
      
      if (data.up_to_date) {
        toast.success("All tenders are up to date - no new analysis needed");
      } else {
        toast.success(`Analysis complete! Found ${data.analyzed_count} new matches.`);
      }
      
      // Refresh the results
      fetchMatchingResults();
    } catch (error) {
      console.error('Error running analysis:', error);
      toast.error('Failed to run tender analysis. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const deleteResult = async (resultId: string) => {
    setDeleting(resultId);
    try {
      const { error } = await supabase
        .from('matching_results')
        .delete()
        .eq('id', resultId);

      if (error) throw error;
      
      setMatchingResults(prev => prev.filter(result => result.id !== resultId));
      toast.success('Match result deleted successfully');
    } catch (error) {
      console.error('Error deleting result:', error);
      toast.error('Failed to delete match result');
    } finally {
      setDeleting(null);
    }
  };

  const toggleBookmark = async (resultId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('matching_results')
        .update({ is_bookmarked: !currentStatus })
        .eq('id', resultId);

      if (error) throw error;
      
      setMatchingResults(prev => 
        prev.map(result => 
          result.id === resultId 
            ? { ...result, is_bookmarked: !currentStatus }
            : result
        )
      );
      toast.success(currentStatus ? 'Removed from saved tenders' : 'Added to saved tenders');
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast.error('Failed to update bookmark');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatBudget = (min?: number, max?: number): string => {
    if (!min && !max) return 'Not specified';
    if (min && max && min !== max) {
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    }
    if (min) return `£${min.toLocaleString()}`;
    if (max) return `£${max.toLocaleString()}`;
    return 'Not specified';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const isDeadlineSoon = (deadline: string): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div className="space-y-6">
      {/* Company Selector - Show only if no specific companyId is provided */}
      {!companyId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Select Company for Analysis
            </CardTitle>
            <CardDescription>
              Choose which company to analyze tender matches for
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanySelector
              selectedCompanyId={selectedCompanyId}
              onCompanySelect={(company) => {
                const companyId = company?.id || null;
                setSelectedCompanyId(companyId);
                // Clear existing results when switching companies
                setMatchingResults([]);
                setFilteredResults([]);
                // Reset filters to default
                resetFilters();
              }}
              showAddButton={false}
              className="w-full max-w-md"
            />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <MatchingFilters 
        onFiltersChange={handleFiltersChange}
        filters={filters}
        onReset={resetFilters}
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {selectedCompanyId ? 'Company Tender Matches' : 'Your Tender Matches'}
            </h2>
            <p className="text-muted-foreground">
              {selectedCompanyId 
                ? 'AI-powered analysis of tender opportunities for the selected company'
                : 'Select a company above to view and analyze tender opportunities'
              }
              {filteredResults.length !== matchingResults.length && (
                <span className="ml-2 text-primary font-medium">
                  (Showing {filteredResults.length} of {matchingResults.length} matches)
                </span>
              )}
            </p>
          </div>
          <Button 
            onClick={runAnalysis} 
            disabled={analyzing || loading || !selectedCompanyId}
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Target className="w-4 h-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="min-h-[400px] flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading tender matches...</p>
            </div>
          </div>
        ) : filteredResults.length === 0 ? (
          <Card className="min-h-[300px]">
            <CardContent className="flex items-center justify-center h-full py-12">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No matching results found</h3>
                <p className="text-muted-foreground mb-4">
                  {matchingResults.length === 0 
                    ? selectedCompanyId 
                      ? "No tender matches found for this company yet. Click 'Run Analysis' to analyze available tenders and find matching opportunities."
                      : "Select a company above and click 'Run Analysis' to find opportunities that match the company profile."
                    : `${matchingResults.length} matches found but filtered out. Active filters: ${filters.quickFilter ? `Quick Filter (${filters.quickFilter}), ` : ''}Score: ${filters.minScore}-${filters.maxScore}%, Status: ${filters.showApplied}. Click Reset to clear filters.`
                  }
                </p>
                {matchingResults.length > 0 && filteredResults.length === 0 && (
                  <Button onClick={resetFilters} variant="outline" className="mb-4">
                    Reset All Filters
                  </Button>
                )}
                {matchingResults.length === 0 && selectedCompanyId && (
                  <Button onClick={runAnalysis} disabled={analyzing}>
                    <Target className="w-4 h-4 mr-2" />
                    {analyzing ? 'Analyzing...' : 'Start Analysis'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {filteredResults.map((result) => (
              <Card key={result.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">
                        {result.tenders.title}
                      </CardTitle>
                      <CardDescription className="flex items-center space-x-4 text-sm">
                        <span className="flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          {result.tenders.buyer}
                        </span>
                        <span>{result.tenders.location}</span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant={result.overall_score >= 80 ? "default" : result.overall_score >= 60 ? "secondary" : "outline"}
                        className="text-lg px-3 py-1"
                      >
                        <TrendingUp className="w-4 h-4 mr-1" />
                        {result.overall_score}%
                      </Badge>
                      {result.is_applied && (
                        <Badge variant="secondary">Applied</Badge>
                      )}
                      {result.is_bookmarked && (
                        <Badge variant="outline">Bookmarked</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* Compact score overview */}
                  <div 
                    className="grid grid-cols-4 gap-2 mb-3 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                    onClick={() => {
                      setSelectedResult(result);
                      setDialogOpen(true);
                    }}
                  >
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Capability</div>
                      <div className={`text-sm font-medium ${getScoreColor(result.capability_score)}`}>
                        {result.capability_score}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Experience</div>
                      <div className={`text-sm font-medium ${getScoreColor(result.experience_score)}`}>
                        {result.experience_score}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Location</div>
                      <div className={`text-sm font-medium ${getScoreColor(result.location_score)}`}>
                        {result.location_score}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Certification</div>
                      <div className={`text-sm font-medium ${getScoreColor(result.certification_score)}`}>
                        {result.certification_score}%
                      </div>
                    </div>
                  </div>

                  {/* Brief summary */}
                  <div 
                    className="cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                    onClick={() => {
                      setSelectedResult(result);
                      setDialogOpen(true);
                    }}
                  >
                    <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                      <div>
                        <span className="font-medium">Budget:</span> {formatBudget(result.tenders.budget_min, result.tenders.budget_max)}
                      </div>
                      <div>
                        <span className="font-medium">Deadline:</span>{' '}
                        <span className={isDeadlineSoon(result.tenders.deadline) ? 'text-red-600 font-medium' : ''}>
                          {result.tenders.deadline ? formatDate(result.tenders.deadline) : 'Not specified'}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {result.tenders.description}
                    </p>
                    
                    {result.match_reasons.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Key Matches:</div>
                        <div className="text-xs text-green-700 dark:text-green-400">
                          {result.match_reasons[0]}
                          {result.match_reasons.length > 1 && ` (+${result.match_reasons.length - 1} more)`}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      Analyzed {formatDate(result.created_at)}
                    </span>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedResult(result);
                          setDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </Button>
                      <Button
                        variant={result.is_bookmarked ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleBookmark(result.id, result.is_bookmarked)}
                      >
                        <Bookmark className={`w-4 h-4 ${result.is_bookmarked ? 'fill-current' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteResult(result.id)}
                        disabled={deleting === result.id}
                      >
                        {deleting === result.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selectedResult && (
          <TenderDetailDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            result={selectedResult}
          />
        )}
      </div>
    </div>
  );
}