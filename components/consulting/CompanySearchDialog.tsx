"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  selectedCapabilityIds?: string[]; // Optional: filter by selected capabilities
}

export function CompanySearchDialog({
  open,
  onOpenChange,
  onAddCompany,
  excludeCompanyIds,
  selectedCapabilityIds = [],
}: CompanySearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      searchCompanies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchQuery, selectedCapabilityIds?.join(",")]);

  const searchCompanies = async () => {
    try {
      setLoading(true);

      if (selectedCapabilityIds && selectedCapabilityIds.length > 0) {
        // Use capability-based search
        const result = await api.getCompaniesByCapabilities({
          capabilityIds: selectedCapabilityIds,
          excludeCompanyIds,
        });
        let filtered = (result.companies as unknown as Company[]) || [];

        // Client-side text filter if search query provided
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              c.company_name.toLowerCase().includes(q) ||
              c.key_capabilities?.toLowerCase().includes(q) ||
              c.postcode?.toLowerCase().includes(q),
          );
        }

        setCompanies(filtered);
      } else {
        // Use directory search for general company search
        const result = await api.getDirectory({
          search: searchQuery || undefined,
          limit: 20,
        });
        let filtered =
          (result.companies as unknown as Company[]) || [];

        // Filter out excluded companies
        if (excludeCompanyIds.length > 0) {
          filtered = filtered.filter(
            (c) => !excludeCompanyIds.includes(c.id),
          );
        }

        setCompanies(filtered);
      }
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
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Company to Team</DialogTitle>
          <DialogDescription>
            Search and add companies from the platform to your consulting team
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by company name, capabilities, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="h-[400px] overflow-y-auto overflow-x-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No companies found
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate">
                          {company.company_name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {company.postcode || "N/A"}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="flex-shrink-0"
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
