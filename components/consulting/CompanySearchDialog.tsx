"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MapPin, Award, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Company {
  id: string;
  company_name: string;
  key_capabilities: string | null;
  certifications: string | null;
  postcode: string | null;
}

interface CompanySearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCompany: (companyId: string) => Promise<void>;
  excludeCompanyIds: string[];
}

export function CompanySearchDialog({
  open,
  onOpenChange,
  onAddCompany,
  excludeCompanyIds,
}: CompanySearchDialogProps) {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // Initialize supabase client
  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (open && supabase) {
      searchCompanies();
    }
  }, [open, searchQuery, supabase]);

  const searchCompanies = async () => {
    if (!supabase) return;

    try {
      setLoading(true);

      let query = supabase
        .from("companies")
        .select("id, company_name, key_capabilities, certifications, postcode")
        .eq("status", "active")
        .limit(20);

      if (excludeCompanyIds.length > 0) {
        query = query.not("id", "in", `(${excludeCompanyIds.join(",")})`);
      }

      if (searchQuery) {
        query = query.or(
          `company_name.ilike.%${searchQuery}%,key_capabilities.ilike.%${searchQuery}%,postcode.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: unknown) {
      console.error("Error searching companies:", error);
      toast.error("Failed to search companies");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (companyId: string) => {
    try {
      setAdding(companyId);
      await onAddCompany(companyId);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error adding company:", error);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Company to Team</DialogTitle>
          <DialogDescription>
            Search and add companies from the platform to your consulting team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by company name, capabilities, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[400px] pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No companies found
              </div>
            ) : (
              <div className="space-y-3">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold">{company.company_name}</h4>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {company.postcode || "N/A"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAdd(company.id)}
                        disabled={adding === company.id}
                      >
                        {adding === company.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>

                    {company.key_capabilities && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {company.key_capabilities}
                      </p>
                    )}

                    {company.certifications && (
                      <div className="text-sm text-muted-foreground flex items-start gap-2">
                        <Award className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1">
                          {company.certifications}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
