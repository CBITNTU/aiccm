import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/components/ui/use-toast";
import { ChevronDown, Download, RefreshCw, Search, Shield, ExternalLink, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUserRole } from '@/hooks/useUserRole';
import { TenderFilters } from './TenderFilters';
import { TenderViewDialog } from './TenderViewDialog';
import { formatCpvCode } from "@/lib/cpvCodes";

interface LiveTender {
  id: string;
  reference_number: string;
  title: string;
  description: string;
  buyer: string;
  location: string;
  status: string;
  publication_date: string;
  deadline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  cpv_codes: string[];
  contact_info: {
    email: string | null;
    phone: string | null;
    organization: string;
  };
  source: string;
  external_id: string;
}

interface LiveTenderFeedProps {
  filters?: any;
}

const LiveTenderFeed: React.FC<LiveTenderFeedProps> = ({ filters: externalFilters = {} }) => {
  const [tenders, setTenders] = useState<LiveTender[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filters, setFilters] = useState<any>(externalFilters);
  const [totalFetched, setTotalFetched] = useState(0);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const [selectedTender, setSelectedTender] = useState<LiveTender | null>(null);
  const [tenderTaxonomies, setTenderTaxonomies] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const { toast } = useToast();
  const { role, loading: roleLoading } = useUserRole();

  // Update internal filters when external filters change
  useEffect(() => {
    setFilters(externalFilters);
  }, [externalFilters]);

  const fetchLiveTenders = async (
    search = '', 
    cursor: string | null = null, 
    adminImport = false, 
    currentFilters = filters,
    retryCount = 0
  ) => {
    if (adminImport) {
      setImporting(true);
    } else {
      setLoading(true);
    }
    
    try {
      // Check if user is authenticated before making the request
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Authentication error. Please sign in again.');
      }
      
      if (!session) {
        throw new Error('Please sign in to access live tenders');
      }

      // Check if session is about to expire (within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = session.expires_at;
      if (expiresAt && expiresAt - now < 300) { // 5 minutes
        console.log('Session about to expire, refreshing...');
        const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('Session refresh error:', refreshError);
          throw new Error('Session expired. Please sign in again.');
        }
      }

      const requestBody = {
        searchTerm: search,
        limit: isAdmin ? 1000 : 50, // Increased limits for better user experience
        cursor,
        adminImport,
        filters: currentFilters
      };

      console.log('Requesting tenders with:', requestBody);

      const { data, error } = await supabase.functions.invoke('fetch-uk-tenders', {
        body: requestBody
      });

      if (error) {
        console.error('Supabase function error:', error);
        
        // Handle authentication errors with retry
        if (error.message?.includes('status code') || error.message?.includes('401') || error.message?.includes('unauthorized')) {
          if (retryCount < 1) {
            console.log('Authentication error, attempting session refresh and retry...');
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshedSession) {
              return fetchLiveTenders(search, cursor, adminImport, currentFilters, retryCount + 1);
            }
          }
          throw new Error('Authentication expired. Please sign in again.');
        }
        throw error;
      }

      if (data.error) {
        if (data.error.includes('Admin access required')) {
          toast({
            title: "Access Denied",
            description: "Only administrators can import tenders to the system",
            variant: "destructive"
          });
          return;
        }
        throw new Error(data.message || 'Failed to fetch tenders');
      }

      // If cursor is null, this is a fresh search - replace tenders
      // If cursor exists, this is loading more - append tenders
      if (!cursor) {
        setTenders(data.tenders || []);
      } else {
        setTenders(prev => [...prev, ...(data.tenders || [])]);
      }
      
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore || false);
      setIsAdmin(data.isAdmin || false);
      setTotalFetched(data.totalFetched || data.tenders?.length || 0);
      setDuplicatesSkipped(data.duplicatesSkipped || 0);

      // Fetch taxonomies for imported tenders
      if (data.tenders && data.tenders.length > 0) {
        const tenderIds = data.tenders.map((t: LiveTender) => t.id).filter(Boolean);
        if (tenderIds.length > 0) {
          const { data: taxData } = await supabase
            .from('tender_taxonomies')
            .select('tender_id, taxonomy_id, taxonomies(id, name)')
            .in('tender_id', tenderIds);
          
          if (taxData) {
            const taxMap: Record<string, Array<{ id: string; name: string }>> = {};
            taxData.forEach(tt => {
              if (!taxMap[tt.tender_id]) taxMap[tt.tender_id] = [];
              const tax = tt.taxonomies as any;
              if (tax?.name) {
                taxMap[tt.tender_id].push({ id: tax.id, name: tax.name });
              }
            });
            setTenderTaxonomies(prev => ({ ...prev, ...taxMap }));
          }
        }
      }

      if (adminImport && data.tenders?.length > 0) {
        const message = duplicatesSkipped > 0 
          ? `Successfully imported ${data.tenders.length} tenders (${duplicatesSkipped} duplicates skipped)`
          : `Successfully imported ${data.tenders.length} tenders from Find a Tender API`;
        
        toast({
          title: "Import Successful",
          description: message,
        });
      } else if (adminImport && (!data.tenders || data.tenders.length === 0)) {
        toast({
          title: "No New Tenders",
          description: "No new tenders found to import at this time",
        });
      } else if (!adminImport && data.source === 'find_tender_api') {
        const message = isAdmin 
          ? `Loaded ${data.tenders?.length || 0} tenders (Total available: ${totalFetched})`
          : `Loaded ${data.tenders?.length || 0} tenders from Find a Tender API`;
        
        toast({
          title: "Live Data Loaded",
          description: message,
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

      // If it's an auth error, redirect to login
      if (errorMessage.includes('sign in') || errorMessage.includes('Authentication expired')) {
        setTimeout(() => {
          window.location.href = '/auth';
        }, 2000);
      }
    } finally {
      setLoading(false);
      setImporting(false);
    }
  };

  const handleSearch = () => {
    fetchLiveTenders(searchTerm, null, false, filters);
  };

  const handleLoadMore = () => {
    if (hasMore && nextCursor) {
      fetchLiveTenders(searchTerm, nextCursor, false, filters);
    }
  };

  const handleRefresh = () => {
    fetchLiveTenders(searchTerm, null, false, filters);
  };

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
    // Auto-fetch with new filters
    fetchLiveTenders(searchTerm, null, false, newFilters);
  };

  const resetFilters = () => {
    const emptyFilters = {};
    setFilters(emptyFilters);
    fetchLiveTenders(searchTerm, null, false, emptyFilters);
  };

  useEffect(() => {
    fetchLiveTenders('', null, false, {});
  }, []);

  // Set admin status based on user role
  useEffect(() => {
    if (!roleLoading && role) {
      setIsAdmin(role === 'superadmin');
    }
  }, [role, roleLoading]);

  const formatBudget = (min?: number | null, max?: number | null): string => {
    if (!min && !max) return 'Budget not specified';
    if (min && max && min !== max) {
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    }
    if (min) return `£${min.toLocaleString()}`;
    if (max) return `£${max.toLocaleString()}`;
    return 'Budget not specified';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const isDeadlineSoon = (deadline: string | null): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <TenderFilters 
        onFiltersChange={handleFiltersChange}
        filters={filters}
        onReset={resetFilters}
      />

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span>Live UK Government Tenders</span>
              {isAdmin && (
                <Badge variant="secondary" className="ml-2">
                  <Shield className="w-3 h-3 mr-1" />
                  Admin (Unlimited)
                </Badge>
              )}
              {totalFetched > 0 && (
                <Badge variant="outline">
                  {totalFetched} available
                </Badge>
              )}
            </div>
            <div className="flex space-x-2">
              {isAdmin && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => fetchLiveTenders(searchTerm, null, true, filters)}
                    disabled={importing || loading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Download className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} />
                    {importing ? 'Importing...' : 'Import All to System'}
                  </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
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

          {duplicatesSkipped > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 dark:bg-yellow-950/20 dark:border-yellow-800">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>Note:</strong> {duplicatesSkipped} duplicate tenders were found and skipped during the last import.
              </p>
            </div>
          )}
        </CardHeader>

      <CardContent>
        {loading && tenders.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading live tenders...</span>
          </div>
        ) : tenders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No tenders found. Try adjusting your search criteria.
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
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
                      <strong>Ref:</strong> {tender.reference_number} | <strong>Buyer:</strong> {tender.buyer}
                    </div>
                    
                    <p className="text-sm mb-3 line-clamp-3">
                      {tender.description}
                    </p>

                    {/* Taxonomies */}
                    {tenderTaxonomies[tender.id] && tenderTaxonomies[tender.id].length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <TagIcon className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">Categories:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {tenderTaxonomies[tender.id].map((taxonomy) => (
                            <Badge key={taxonomy.id} variant="secondary" className="text-xs">
                              {taxonomy.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Location:</span> {tender.location}
                      </div>
                      <div>
                        <span className="font-medium">Budget:</span> {formatBudget(tender.budget_min, tender.budget_max)}
                      </div>
                      <div>
                        <span className="font-medium">Published:</span> {formatDate(tender.publication_date)}
                      </div>
                      <div>
                        <span className="font-medium">Deadline:</span>{' '}
                        {tender.deadline ? formatDate(tender.deadline) : 'Not specified'}
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-3 border-t">
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Source: {tender.source === 'find_tender' ? 'Find a Tender API' : 'Contracts Finder'}</div>
                        {tender.cpv_codes && tender.cpv_codes.length > 0 && (
                          <div>
                            CPV: {tender.cpv_codes.map(code => {
                              const cpv = formatCpvCode(code);
                              return `${cpv.code} (${cpv.name})`;
                            }).join(' | ')}
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a 
                            href={`https://www.find-tender.service.gov.uk/Notice/${tender.external_id}?origin=SearchResults&p=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Go to Original Website
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Load More Button - Only for Admins */}
        {hasMore && isAdmin && (
          <div className="flex items-center justify-center mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loading}
              className="flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span>Loading more...</span>
                </>
              ) : (
                <>
                  <span>Load More Tenders</span>
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
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

export default LiveTenderFeed;