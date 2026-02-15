"use client";

 
import { useEffect, useState, useMemo, useRef } from "react";
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
import { Tag, Loader2 } from "lucide-react";
import { CapabilityTreeSelector } from "@/components/tenders/CapabilityTreeSelector";

interface Capability {
  id: string;
  name: string;
  category: string;
}

interface CompanyCapabilitySelectorProps {
  companyId: string;
  onUpdate?: () => void;
}

export function CompanyCapabilitySelector({
  companyId,
  onUpdate,
}: CompanyCapabilitySelectorProps) {
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<string[]>(
    [],
  );
  const [allCapabilities, setAllCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompanyCapabilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fetchCompanyCapabilities = async () => {
    try {
      setLoading(true);
      const data = await api.getCompanyCapabilities(companyId);
      setSelectedCapabilityIds(data.capabilities.map((c) => c.id));
      setAllCapabilities(data.capabilities);
    } catch (error) {
      console.error("Error fetching company capabilities:", error);
      toast.error("Failed to load capabilities");
    } finally {
      setLoading(false);
    }
  };

  const saveCapabilities = async (capabilityIds: string[]) => {
    try {
      setSaving(true);
      const result = await api.syncCapabilities(companyId, capabilityIds);
      setSelectedCapabilityIds(capabilityIds);
      setAllCapabilities(result.capabilities);
      onUpdate?.();
    } catch (error) {
      console.error("Error saving capabilities:", error);
      toast.error("Failed to save capabilities");
      await fetchCompanyCapabilities();
    } finally {
      setSaving(false);
    }
  };

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectionChange = (capabilityIds: string[]) => {
    setSelectedCapabilityIds(capabilityIds);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveCapabilities(capabilityIds);
      saveTimeoutRef.current = null;
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const groupedSelected = useMemo(() => {
    const groups = new Map<string | null, Capability[]>();
    allCapabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(cap);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "Uncategorized") return 1;
      if (b[0] === "Uncategorized") return -1;
      return (a[0] || "").localeCompare(b[0] || "");
    });
  }, [allCapabilities]);

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
          <Tag className="h-5 w-5" />
          Company Capabilities
        </CardTitle>
        <CardDescription>
          Select capabilities that your company has. Changes are saved
          automatically.
          {saving && <span className="ml-2 text-primary">Saving...</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {selectedCapabilityIds.length > 0 && (
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Currently Selected ({selectedCapabilityIds.length})
              </h3>
            </div>
            <div className="space-y-3">
              {groupedSelected.map(([category, caps]) => (
                <div key={category || "uncategorized"}>
                  {category && category !== "Uncategorized" && (
                    <h4 className="font-semibold text-xs text-muted-foreground mb-2 uppercase">
                      {category}
                    </h4>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {caps.map((cap) => (
                      <Badge key={cap.id} variant="default">
                        {cap.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <CapabilityTreeSelector
            selectedCapabilities={selectedCapabilityIds}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
