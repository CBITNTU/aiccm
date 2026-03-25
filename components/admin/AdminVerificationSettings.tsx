"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export function AdminVerificationSettings() {
  const [verifiedProjectLimit, setVerifiedProjectLimit] = useState(5);
  const [unverifiedProjectLimit, setUnverifiedProjectLimit] = useState(1);
  const [unverifiedCompetencyLimit, setUnverifiedCompetencyLimit] = useState(5);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success("Verification settings saved.");
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
          Control project and competency limits for verified and unverified companies.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
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
