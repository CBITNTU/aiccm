import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, Search, Calendar, MapPin, Building2, PoundSterling, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TenderViewDialog } from './TenderViewDialog';

interface DatabaseTender {
  id: string;
  title: string;
  description: string;
  buyer: string;
  location: string;
  status: string;
  publication_date: string;
  deadline: string;
  budget_min: number;
  budget_max: number;
  reference_number: string;
  cpv_codes: string[];
}

interface DatabaseTenderFeedProps {
  filters?: any;
}

const DatabaseTenderFeed: React.FC<DatabaseTenderFeedProps> = ({ filters = {} }) => {
  const [tenders, setTenders] = useState<DatabaseTender[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTender, setSelectedTender] = useState<DatabaseTender | null>(null);
  const { toast } = useToast();

  const fetchDatabaseTenders = async (search = '') => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('tenders')
        .select('*')
        .neq('status', 'closed')
        .order('publication_date', { ascending: false });

      // Apply keyword filter from filters
      const keyword = filters.keyword || search;
      if (keyword.trim()) {
        query = query.or(
          `title.ilike.%${keyword}%,description.ilike.%${keyword}%,buyer.ilike.%${keyword}%,location.ilike.%${keyword}%`
        );
      }

      // Apply external filters
      if (filters.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }
      
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.budgetMin) {
        query = query.gte('budget_min', filters.budgetMin);
      }
      
      if (filters.budgetMax) {
        query = query.lte('budget_max', filters.budgetMax);
      }
      
      if (filters.dateFrom) {
        query = query.gte('publication_date', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query = query.lte('publication_date', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching tenders:', error);
        throw error;
      }

      setTenders(data || []);
      
      if (search.trim() || Object.keys(filters).some(key => filters[key])) {
        toast({
          title: "Search Complete",
          description: `Found ${data?.length || 0} matching tenders`,
        });
      }
    } catch (error) {
      console.error('Error fetching tenders:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch tenders";
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchDatabaseTenders(searchTerm);
  };

  const handleRefresh = () => {
    fetchDatabaseTenders(searchTerm);
  };

  // Fetch tenders when filters change
  useEffect(() => {
    fetchDatabaseTenders(searchTerm);
  }, [filters]);

  useEffect(() => {
    fetchDatabaseTenders();
  }, []);

  const formatBudget = (min?: number, max?: number) => {
    if (!min && !max) return 'Budget not disclosed';
    if (min && max) return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    if (min) return `From £${min.toLocaleString()}`;
    if (max) return `Up to £${max.toLocaleString()}`;
    return 'Budget not disclosed';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const isDeadlineSoon = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span>All Database Tenders</span>
              <Badge variant="outline">
                {tenders.length} open tenders
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
          
          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Search tenders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Loading tenders...</span>
            </div>
          ) : tenders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No open tenders found in the database.
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {tenders.map((tender) => (
                  <Card 
                    key={tender.id} 
                    className="border-l-4 border-l-primary/20 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedTender(tender)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg text-primary">
                          {tender.title}
                        </h3>
                        <div className="flex space-x-2 ml-4">
                          {tender.deadline && isDeadlineSoon(tender.deadline) && (
                            <Badge variant="destructive">
                              Deadline Soon
                            </Badge>
                          )}
                          <Badge variant="secondary">
                            {tender.status}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground mb-2">
                        {tender.reference_number && (
                          <>
                            <strong>Ref:</strong> {tender.reference_number} | 
                          </>
                        )}
                        <strong> Buyer:</strong> {tender.buyer}
                      </div>
                      
                      <p className="text-sm mb-3 line-clamp-3">
                        {tender.description}
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-1 text-muted-foreground" />
                          {tender.location || 'Location not specified'}
                        </div>
                        <div className="flex items-center">
                          <PoundSterling className="w-4 h-4 mr-1 text-muted-foreground" />
                          {formatBudget(tender.budget_min, tender.budget_max)}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
                          Published: {formatDate(tender.publication_date)}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
                          Deadline: {tender.deadline ? formatDate(tender.deadline) : 'Not specified'}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t">
                        <div className="text-xs text-muted-foreground">
                          {tender.cpv_codes && tender.cpv_codes.length > 0 && (
                            <>CPV: {tender.cpv_codes.join(', ')}</>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {tender.reference_number && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a 
                                href={`https://www.find-tender.service.gov.uk/Notice/${tender.reference_number}?origin=SearchResults`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Go to Original Website
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Tender View Dialog */}
      <TenderViewDialog
        tender={selectedTender}
        open={!!selectedTender}
        onOpenChange={(open) => !open && setSelectedTender(null)}
      />
    </div>
  );
};

export default DatabaseTenderFeed;