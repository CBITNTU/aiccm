"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export function AdminVerificationSettings() {
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
          toast.error(e instanceof Error ? e.message : "Failed to load settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success("Settings saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
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
        <CardTitle>Verification & Usage Limits</CardTitle>
        <p className="text-sm text-muted-foreground">
          Control project, competency, and tender matching limits for verified and unverified companies.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-3">Project & Competency Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="verified-project-limit">
                Verified company project limit
              </Label>
              <Input
                id="verified-project-limit"
                type="number"
                min={0}
                value={verifiedProjectLimit}
                onChange={(e) => setVerifiedProjectLimit(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Max active projects for verified companies
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-project-limit">
                Unverified company project limit
              </Label>
              <Input
                id="unverified-project-limit"
                type="number"
                min={0}
                value={unverifiedProjectLimit}
                onChange={(e) => setUnverifiedProjectLimit(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Max active projects for unverified companies
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-competency-limit">
                Unverified company competency limit
              </Label>
              <Input
                id="unverified-competency-limit"
                type="number"
                min={0}
                value={unverifiedCompetencyLimit}
                onChange={(e) => setUnverifiedCompetencyLimit(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Max competencies for unverified companies (no review needed)
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-1">Tender Matching Runs per Month</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Controls how many times a company can run &quot;Run Analysis&quot; per calendar month. Per-company overrides can be set in the Companies tab.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="verified-matching-runs">
                Verified company matching runs / month
              </Label>
              <Input
                id="verified-matching-runs"
                type="number"
                min={0}
                value={verifiedMatchingRunsPerMonth}
                onChange={(e) => setVerifiedMatchingRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Default: 10 runs per month for verified companies
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-matching-runs">
                Unverified company matching runs / month
              </Label>
              <Input
                id="unverified-matching-runs"
                type="number"
                min={0}
                value={unverifiedMatchingRunsPerMonth}
                onChange={(e) => setUnverifiedMatchingRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Default: 2 runs per month for unverified companies
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-1">AI Analysis Runs per Month</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Controls how many times a company can run &quot;AI Analysis&quot; per calendar month. Per-company overrides can be set in the Companies tab.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="verified-analysis-runs">
                Verified company analysis runs / month
              </Label>
              <Input
                id="verified-analysis-runs"
                type="number"
                min={0}
                value={verifiedAnalysisRunsPerMonth}
                onChange={(e) => setVerifiedAnalysisRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Default: 5 runs per month for verified companies
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unverified-analysis-runs">
                Unverified company analysis runs / month
              </Label>
              <Input
                id="unverified-analysis-runs"
                type="number"
                min={0}
                value={unverifiedAnalysisRunsPerMonth}
                onChange={(e) => setUnverifiedAnalysisRunsPerMonth(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Default: 1 run per month for unverified companies
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save limits
        </Button>
      </CardContent>
    </Card>
  );
}
