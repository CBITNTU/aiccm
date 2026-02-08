"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- capability row types */
import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
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
import type { Database } from "@/lib/supabase/types";

type Capability =
  Database["public"]["Tables"]["company_capabilities_ref"]["Row"];

interface CompanyCapabilitySelectorProps {
  companyId: string;
  onUpdate?: () => void; // Callback to refresh parent component
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
    fetchAllCapabilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run on companyId change
  }, [companyId]);

  const fetchCompanyCapabilities = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("company_capabilities")
        .select("company_capabilities_ref(id, name, category)")
        .eq("company_id", companyId);

      if (error) throw error;

      const caps = (data || [])
        .map((cc: any) => cc.company_capabilities_ref)
        .filter(Boolean) as Capability[];

      setSelectedCapabilityIds(caps.map((c) => c.id));
      setAllCapabilities(caps);
    } catch (error) {
      console.error("Error fetching company capabilities:", error);
      toast.error("Failed to load capabilities");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllCapabilities = async () => {
    try {
      const supabase = createClient();
      const { data: _data, error } = await supabase
        .from("company_capabilities_ref")
        .select("id, name, category")
        .eq("is_active", true)
        .order("category")
        .order("name");

      if (error) throw error;
      // Not storing all capabilities here - CapabilityTreeSelector will fetch them
    } catch (error) {
      console.error("Error fetching all capabilities:", error);
    }
  };

  // Save capabilities to database (auto-save on change)
  const saveCapabilities = async (capabilityIds: string[]) => {
    try {
      setSaving(true);
      const supabase = createClient();

      // Get current capabilities
      const { data: currentData } = await supabase
        .from("company_capabilities")
        .select("capability_id")
        .eq("company_id", companyId);

      const currentIds = new Set(
        (currentData || []).map((c: any) => c.capability_id),
      );
      const newIds = new Set(capabilityIds);

      // Find capabilities to add and remove
      const toAdd = capabilityIds.filter((id) => !currentIds.has(id));
      const toRemove = Array.from(currentIds).filter((id) => !newIds.has(id));

      // Remove capabilities
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from("company_capabilities")
          .delete()
          .eq("company_id", companyId)
          .in("capability_id", toRemove);

        if (deleteError) throw deleteError;
      }

      // Add new capabilities
      if (toAdd.length > 0) {
        const inserts = toAdd.map((capabilityId) => ({
          company_id: companyId,
          capability_id: capabilityId,
        }));

        const { error: insertError } = await supabase
          .from("company_capabilities")
          .insert(inserts);

        if (insertError) throw insertError;
      }

      // Update local state
      setSelectedCapabilityIds(capabilityIds);

      // Fetch updated capabilities for display
      const { data: updatedData } = await supabase
        .from("company_capabilities")
        .select("company_capabilities_ref(id, name, category)")
        .eq("company_id", companyId);

      if (updatedData) {
        const caps = (updatedData || [])
          .map((cc: any) => cc.company_capabilities_ref)
          .filter(Boolean) as Capability[];
        setAllCapabilities(caps);
      }

      onUpdate?.(); // Notify parent to refresh
    } catch (error) {
      console.error("Error saving capabilities:", error);
      toast.error("Failed to save capabilities");
      // Revert on error
      await fetchCompanyCapabilities();
    } finally {
      setSaving(false);
    }
  };

  // Debounce timer ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectionChange = (capabilityIds: string[]) => {
    // Update immediately for UI responsiveness
    setSelectedCapabilityIds(capabilityIds);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Save with debounce (500ms after last change)
    saveTimeoutRef.current = setTimeout(() => {
      saveCapabilities(capabilityIds);
      saveTimeoutRef.current = null;
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Group selected capabilities by category for display
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
        {/* Current Selected Capabilities - Clear List */}
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

        {/* Reuse CapabilityTreeSelector component */}
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
