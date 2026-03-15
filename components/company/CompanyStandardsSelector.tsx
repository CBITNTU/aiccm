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
import { Award, Loader2, Pencil } from "lucide-react";
import { StandardsTreeSelector } from "@/components/company/StandardsTreeSelector";

interface CompanyStandardsSelectorProps {
  companyId: string;
  onUpdate?: () => void;
}

export function CompanyStandardsSelector({
  companyId,
  onUpdate,
}: CompanyStandardsSelectorProps) {
  const [selectedStandardIds, setSelectedStandardIds] = useState<string[]>([]);
  const [standardNames, setStandardNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchCompanyStandards();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchCompanyStandards is stable

  const fetchCompanyStandards = async () => {
    try {
      setLoading(true);
      const data = await api.getCompanyStandards(companyId);
      const standards = data.standards || [];
      setSelectedStandardIds(standards.map((s) => s.id));
      setStandardNames(Object.fromEntries(standards.map((s) => [s.id, s.name])));
    } catch (error) {
      console.error("Error fetching company standards:", error);
      toast.error("Failed to load standards");
    } finally {
      setLoading(false);
    }
  };

  const saveStandards = async (standardIds: string[]) => {
    try {
      setSaving(true);
      const result = await api.syncStandards(companyId, standardIds);
      setSelectedStandardIds(standardIds);
      setStandardNames(
        Object.fromEntries((result.standards || []).map((s) => [s.id, s.name])),
      );
      setEditMode(false);
      onUpdate?.();
    } catch (error) {
      console.error("Error saving standards:", error);
      toast.error("Failed to save standards");
      await fetchCompanyStandards();
    } finally {
      setSaving(false);
    }
  };

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectionChange = (ids: string[]) => {
    setSelectedStandardIds(ids);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveStandards(ids);
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
          <Award className="h-5 w-5" />
          Standards & Certifications
        </CardTitle>
        <CardDescription>
          {editMode
            ? "Select standards and certifications your company holds. Changes are saved automatically."
            : "Standards and certifications your company holds."}
          {saving && <span className="ml-2 text-primary">Saving...</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editMode ? (
          <>
            <div className="flex flex-wrap gap-2">
              {selectedStandardIds.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No standards selected.
                </span>
              ) : (
                selectedStandardIds.map((id) => (
                  <Badge key={id} variant="secondary">
                    {standardNames[id] ?? id}
                  </Badge>
                ))
              )}
            </div>
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
          </>
        ) : (
          <>
            {selectedStandardIds.length > 0 && (
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
                <h3 className="font-semibold text-sm">
                  Currently Selected ({selectedStandardIds.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedStandardIds.map((id) => (
                    <Badge key={id} variant="default">
                      {standardNames[id] ?? id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <StandardsTreeSelector
              selectedStandardIds={selectedStandardIds}
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
