"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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

const UNCATEGORIZED_CATEGORY = "Uncategorized";
import { CapabilityTreeSelector } from "@/components/tenders/CapabilityTreeSelector";

interface Capability {
  id: string;
  name: string;
  category: string;
}

interface CompanyCapabilitySelectorProps {
  companyId: string;
  onUpdate?: () => void;
  isEditLocked?: boolean;
  hasPendingDraft?: boolean;
}

export function CompanyCapabilitySelector({
  companyId,
  onUpdate,
  isEditLocked = false,
  hasPendingDraft = false,
}: CompanyCapabilitySelectorProps) {
  const t = useTranslations("CompanyPage");
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
      toast.error(t("capabilitySelector.failedToLoad"));
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
        toast.success(result.message || t("capabilitySelector.changesSavedDraft"));
        setHasPendingRequest(true);
        setEditMode(false);
        onUpdate?.();
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
      const message = error instanceof Error ? error.message : t("capabilitySelector.failedToSave");
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
      toast.error(t("capabilitySelector.limitError", { limit: competencyLimit }));
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
      const category = cap.category || UNCATEGORIZED_CATEGORY;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(cap);
    });
    return Array.from(groups.entries()).toSorted((a, b) => {
      if (a[0] === UNCATEGORIZED_CATEGORY) return 1;
      if (b[0] === UNCATEGORIZED_CATEGORY) return -1;
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
          {t("capabilitySelector.title")}
          {competencyLimit !== null && !isVerified && (
            <Badge variant="outline" className="text-xs font-normal ml-auto">
              {selectedCapabilityIds.length}/{competencyLimit}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {isEditLocked ? (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              {t("capabilitySelector.editingLocked")}
            </span>
          ) : hasPendingRequest || hasPendingDraft ? (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              {t("capabilitySelector.changesSavedDraft")}
            </span>
          ) : editMode ? (
            isVerified
              ? t("capabilitySelector.selectDescVerified")
              : competencyLimit !== null
                ? t("capabilitySelector.selectDescUnverifiedWithLimit", { limit: competencyLimit })
                : t("capabilitySelector.selectDescUnverified")
          ) : (
            t("capabilitySelector.viewDesc")
          )}
          {saving && <span className="ml-2 text-primary">{t("capabilitySelector.saving")}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editMode ? (
          <>
            <div className="flex flex-wrap gap-2">
              {selectedCapabilityIds.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {t("capabilitySelector.noCapabilitiesSelected")}
                </span>
              ) : (
                allCapabilities.map((cap) => (
                  <Badge key={cap.id} variant="secondary">
                    {cap.name}
                  </Badge>
                ))
              )}
            </div>
            {!hasPendingRequest && !isEditLocked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
                className="gap-1"
              >
                <Pencil className="h-3 w-3" />
                {t("capabilitySelector.edit")}
              </Button>
            )}
          </>
        ) : (
          <>
            {selectedCapabilityIds.length > 0 && (
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                <h3 className="font-semibold text-sm">
                  {t("capabilitySelector.currentlySelected", { count: selectedCapabilityIds.length })}
                </h3>
                <div className="space-y-3">
                  {groupedSelected.map(([category, caps]) => (
                    <div key={category || "uncategorized"}>
                      {category && (
                        <h4 className="font-semibold text-xs text-muted-foreground mb-2 uppercase">
                          {category === UNCATEGORIZED_CATEGORY
                            ? t("capabilitySelector.uncategorized")
                            : category}
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
                    {t("capabilitySelector.saveAsDraft")}
                  </>
                ) : (
                  t("capabilitySelector.done")
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
                  {t("capabilitySelector.cancel")}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
