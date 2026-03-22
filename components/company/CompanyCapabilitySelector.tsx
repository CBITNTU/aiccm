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
import { Button } from "@/components/ui/button";
import { Tag, Loader2, Pencil, Clock, ShieldCheck } from "lucide-react";
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
  const [editMode, setEditMode] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string>("unverified");
  const [competencyLimit, setCompetencyLimit] = useState<number | null>(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

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
      setVerificationStatus(data.verificationStatus ?? "unverified");
      setCompetencyLimit(data.competencyLimit ?? null);
      setHasPendingRequest(!!data.pendingCompetencyRequest);
    } catch (error) {
      console.error("Error fetching company capabilities:", error);
      toast.error("Failed to load capabilities");
    } finally {
      setLoading(false);
    }
  };

  const isVerified = verificationStatus === "verified";

  const saveCapabilities = async (capabilityIds: string[]) => {
    try {
      setSaving(true);
      const result = await api.syncCapabilities(companyId, capabilityIds);

      if (result.pendingReview) {
        toast.success(result.message || "Your competency changes have been submitted for review.");
        setHasPendingRequest(true);
        setEditMode(false);
      } else if (result.error) {
        toast.error(result.error);
        await fetchCompanyCapabilities();
      } else if (result.capabilities) {
        setSelectedCapabilityIds(capabilityIds);
        setAllCapabilities(result.capabilities);
        onUpdate?.();
      }
    } catch (error) {
      console.error("Error saving capabilities:", error);
      const message = error instanceof Error ? error.message : "Failed to save capabilities";
      toast.error(message);
      await fetchCompanyCapabilities();
    } finally {
      setSaving(false);
    }
  };

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectionChange = (capabilityIds: string[]) => {
    // For unverified companies, check limit before allowing selection
    if (!isVerified && competencyLimit !== null && capabilityIds.length > competencyLimit) {
      toast.error(`Unverified companies can select up to ${competencyLimit} competencies. Get verified to unlock unlimited competencies.`);
      return;
    }

    setSelectedCapabilityIds(capabilityIds);

    // For verified companies, don't auto-save (they need to click Done to submit for review)
    if (isVerified) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveCapabilities(capabilityIds);
      saveTimeoutRef.current = null;
    }, 500);
  };

  const handleDoneEditing = () => {
    if (isVerified) {
      // Submit for review
      saveCapabilities(selectedCapabilityIds);
    }
    setEditMode(false);
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
    return Array.from(groups.entries()).toSorted((a, b) => {
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
          Competency
          {competencyLimit !== null && !isVerified && (
            <Badge variant="outline" className="text-xs font-normal ml-auto">
              {selectedCapabilityIds.length}/{competencyLimit}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {hasPendingRequest ? (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              Your competency changes are pending review by an admin.
            </span>
          ) : editMode ? (
            isVerified
              ? "Select capabilities. Changes will be submitted for admin review."
              : `Select capabilities that your company has.${competencyLimit !== null ? ` Up to ${competencyLimit} for unverified companies.` : ""} Changes are saved automatically.`
          ) : (
            "Capabilities your company has."
          )}
          {saving && <span className="ml-2 text-primary">Saving...</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editMode ? (
          <>
            <div className="flex flex-wrap gap-2">
              {selectedCapabilityIds.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No capabilities selected.
                </span>
              ) : (
                allCapabilities.map((cap) => (
                  <Badge key={cap.id} variant="secondary">
                    {cap.name}
                  </Badge>
                ))
              )}
            </div>
            {!hasPendingRequest && (
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
            {selectedCapabilityIds.length > 0 && (
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                <h3 className="font-semibold text-sm">
                  Currently Selected ({selectedCapabilityIds.length})
                </h3>
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
            <CapabilityTreeSelector
              selectedCapabilities={selectedCapabilityIds}
              onSelectionChange={handleSelectionChange}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={isVerified ? "default" : "outline"}
                size="sm"
                onClick={handleDoneEditing}
                disabled={saving}
                className="gap-1"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {isVerified ? (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    Submit for Review
                  </>
                ) : (
                  "Done"
                )}
              </Button>
              {isVerified && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditMode(false);
                    fetchCompanyCapabilities();
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
