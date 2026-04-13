"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export function AdminVerificationSettings() {
  const t = useTranslations("AdminSettings.verification");
  const [verifiedProjectLimit, setVerifiedProjectLimit] = useState(5);
  const [unverifiedProjectLimit, setUnverifiedProjectLimit] = useState(1);
  const [unverifiedCompetencyLimit, setUnverifiedCompetencyLimit] = useState(5);
  const [verifiedMatchingRunsPerMonth, setVerifiedMatchingRunsPerMonth] = useState(10);
  const [unverifiedMatchingRunsPerMonth, setUnverifiedMatchingRunsPerMonth] = useState(2);
  const [verifiedAnalysisRunsPerMonth, setVerifiedAnalysisRunsPerMonth] = useState(5);
  const [unverifiedAnalysisRunsPerMonth, setUnverifiedAnalysisRunsPerMonth] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/verification");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (cancelled) return;
        setVerifiedProjectLimit(data.verifiedProjectLimit ?? 5);
        setUnverifiedProjectLimit(data.unverifiedProjectLimit ?? 1);
        setUnverifiedCompetencyLimit(data.unverifiedCompetencyLimit ?? 5);
        setVerifiedMatchingRunsPerMonth(data.verifiedMatchingRunsPerMonth ?? 10);
        setUnverifiedMatchingRunsPerMonth(data.unverifiedMatchingRunsPerMonth ?? 2);
        setVerifiedAnalysisRunsPerMonth(data.verifiedAnalysisRunsPerMonth ?? 5);
        setUnverifiedAnalysisRunsPerMonth(data.unverifiedAnalysisRunsPerMonth ?? 1);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t("toasts.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verifiedProjectLimit,
          unverifiedProjectLimit,
          unverifiedCompetencyLimit,
          verifiedMatchingRunsPerMonth,
          unverifiedMatchingRunsPerMonth,
          verifiedAnalysisRunsPerMonth,
          unverifiedAnalysisRunsPerMonth,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("toasts.saveError"));
      toast.success(t("toasts.saveSuccess"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("cardDescription")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-3">{t("sections.projectLimits")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="verified-project-limit">{t("fields.verifiedProjectLimit")}</Label>
              <Input
                id="verified-project-limit"
                type="number"
                min={0}
                value={verifiedProjectLimit}
                onChange={(e) => setVerifiedProjectLimit(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.verifiedProjectLimitHelper")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-project-limit">{t("fields.unverifiedProjectLimit")}</Label>
              <Input
                id="unverified-project-limit"
                type="number"
                min={0}
                value={unverifiedProjectLimit}
                onChange={(e) => setUnverifiedProjectLimit(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.unverifiedProjectLimitHelper")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-competency-limit">{t("fields.unverifiedCompetencyLimit")}</Label>
              <Input
                id="unverified-competency-limit"
                type="number"
                min={0}
                value={unverifiedCompetencyLimit}
                onChange={(e) => setUnverifiedCompetencyLimit(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.unverifiedCompetencyLimitHelper")}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-1">{t("sections.matchingRuns")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t("sections.matchingRunsHelper")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="verified-matching-runs">{t("fields.verifiedMatchingRuns")}</Label>
              <Input
                id="verified-matching-runs"
                type="number"
                min={0}
                value={verifiedMatchingRunsPerMonth}
                onChange={(e) => setVerifiedMatchingRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.verifiedMatchingRunsHelper")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-matching-runs">{t("fields.unverifiedMatchingRuns")}</Label>
              <Input
                id="unverified-matching-runs"
                type="number"
                min={0}
                value={unverifiedMatchingRunsPerMonth}
                onChange={(e) => setUnverifiedMatchingRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.unverifiedMatchingRunsHelper")}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-1">{t("sections.analysisRuns")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t("sections.analysisRunsHelper")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="verified-analysis-runs">{t("fields.verifiedAnalysisRuns")}</Label>
              <Input
                id="verified-analysis-runs"
                type="number"
                min={0}
                value={verifiedAnalysisRunsPerMonth}
                onChange={(e) => setVerifiedAnalysisRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.verifiedAnalysisRunsHelper")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-analysis-runs">{t("fields.unverifiedAnalysisRuns")}</Label>
              <Input
                id="unverified-analysis-runs"
                type="number"
                min={0}
                value={unverifiedAnalysisRunsPerMonth}
                onChange={(e) => setUnverifiedAnalysisRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">{t("fields.unverifiedAnalysisRunsHelper")}</p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t("saveButton")}
        </Button>
      </CardContent>
    </Card>
  );
}
