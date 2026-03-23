"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, Pencil, Clock } from "lucide-react";
import { MarketTreeSelector } from "@/components/company/MarketTreeSelector";

interface CompanyMarketSelectorProps {
  companyId: string;
  onUpdate?: () => void;
  isEditLocked?: boolean;
  hasPendingDraft?: boolean;
}

export function CompanyMarketSelector({
  companyId,
  onUpdate,
  isEditLocked = false,
  hasPendingDraft = false,
}: CompanyMarketSelectorProps) {
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [marketNames, setMarketNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchCompanyMarkets();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchCompanyMarkets is stable

  const fetchCompanyMarkets = async () => {
    try {
      setLoading(true);
      const data = await api.getCompanyMarkets(companyId);
      const markets = data.markets || [];
      setSelectedMarketIds(markets.map((m) => m.id));
      setMarketNames(Object.fromEntries(markets.map((m) => [m.id, m.name])));
    } catch (error) {
      console.error("Error fetching company markets:", error);
      toast.error("Failed to load markets");
    } finally {
      setLoading(false);
    }
  };

  const saveMarkets = async (marketIds: string[]) => {
    try {
      setSaving(true);
      const result = await api.syncMarkets(companyId, marketIds);
      if (result.draftSaved) {
        toast.success(result.message || "Market changes saved as draft.");
        setEditMode(false);
        onUpdate?.();
      } else {
        setSelectedMarketIds(marketIds);
        setMarketNames(
          Object.fromEntries((result.markets || []).map((m) => [m.id, m.name])),
        );
        setEditMode(false);
        onUpdate?.();
      }
    } catch (error) {
      console.error("Error saving markets:", error);
      const message = error instanceof Error ? error.message : "Failed to save markets";
      toast.error(message);
      await fetchCompanyMarkets();
    } finally {
      setSaving(false);
    }
  };

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectionChange = (ids: string[]) => {
    setSelectedMarketIds(ids);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveMarkets(ids);
      saveTimeoutRef.current = null;
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Market
        </CardTitle>
        <CardDescription>
          {isEditLocked ? (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              Editing locked while changes are under review.
            </span>
          ) : hasPendingDraft ? (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              Market changes saved as draft.
            </span>
          ) : editMode ? (
            "Select the markets your company serves. Changes are saved automatically."
          ) : (
            "Markets your company serves."
          )}
          {saving && <span className="ml-2 text-primary">Saving...</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editMode ? (
          <>
            <div className="flex flex-wrap gap-2">
              {selectedMarketIds.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No markets selected.
                </span>
              ) : (
                selectedMarketIds.map((id) => (
                  <Badge key={id} variant="secondary">
                    {marketNames[id] ?? id}
                  </Badge>
                ))
              )}
            </div>
            {!isEditLocked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
                className="gap-1"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
          </>
        ) : (
          <>
            {selectedMarketIds.length > 0 && (
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
                <h3 className="font-semibold text-sm">
                  Currently Selected ({selectedMarketIds.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedMarketIds.map((id) => (
                    <Badge key={id} variant="default">
                      {marketNames[id] ?? id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <MarketTreeSelector
              selectedMarketIds={selectedMarketIds}
              onSelectionChange={handleSelectionChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditMode(false)}
            >
              Done
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
