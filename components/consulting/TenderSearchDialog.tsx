"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Loader2,
  Calendar,
  Building2,
  MapPin,
  Banknote,
  FileText,
} from "lucide-react";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import type { TenderRecord } from "@/lib/api/types";
import { useTranslations } from "next-intl";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";

type Tender = TenderRecord;

interface TenderSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTender: (tender: Tender) => void;
  excludeTenderId?: string | null;
}

async function searchTenders(query: string): Promise<Tender[]> {
  const result = await api.getAvailableTendersSearch(
    query.trim() ? { search: query } : undefined,
  );
  return (result.tenders as unknown as Tender[]) || [];
}

export function TenderSearchDialog({
  open,
  onOpenChange,
  onSelectTender,
  excludeTenderId,
}: TenderSearchDialogProps) {
  const t = useTranslations("TenderSearchDialog");
  const { currency } = useDeployment();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset search when dialog opens
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form when dialog opens
      setSearchQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data: tenders, isLoading } = useQuery({
    queryKey: ["tenderSearch", debouncedQuery],
    queryFn: () => searchTenders(debouncedQuery),
    enabled: open,
  });

  const filteredTenders =
    tenders?.filter((t) => t.id !== excludeTenderId) || [];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t("noDeadline");
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTenderValue = (
    value: number | null | undefined,
    tenderCurrency: string | null | undefined,
  ) => {
    if (!value) return null;
    return formatCurrency(value, resolveCurrencyConfig(tenderCurrency, currency));
  };

  const handleSelect = (tender: Tender) => {
    onSelectTender(tender);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>

        {/* Results */}
        <ScrollArea className="h-[400px] -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTenders.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {debouncedQuery
                ? t("noResults")
                : t("noTenders")}
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {filteredTenders.map((tender) => (
                <div
                  key={tender.id}
                  className="p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleSelect(tender)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium line-clamp-2">
                        {tender.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {tender.buyer}
                        </span>

                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(tender.deadline)}
                        </span>

                        {tender.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {tender.location}
                          </span>
                        )}

                        {tender.budgetMax && (
                          <span className="flex items-center gap-1">
                            <Banknote className="h-3.5 w-3.5" />
                            {formatTenderValue(tender.budgetMax, tender.currency)}
                          </span>
                        )}
                      </div>

                      {tender.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {tender.description}
                        </p>
                      )}
                    </div>

                    <TenderStatusBadge status={tender.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancelButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
