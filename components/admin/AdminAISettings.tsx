"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { DefaultReasoningEffort } from "@/lib/platformSettings";
import { SUPPORTED_MODELS } from "@/lib/ai/models";

type ReasoningOption = DefaultReasoningEffort;

export function AdminAISettings() {
  const [defaultModel, setDefaultModel] = useState<string>("gpt-5-nano");
  const [defaultReasoningEffort, setDefaultReasoningEffort] =
    useState<ReasoningOption>("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/ai");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (cancelled) return;
        setDefaultModel(data.default_ai_model ?? "gpt-5-nano");
        setDefaultReasoningEffort(
          (data.default_reasoning_effort as ReasoningOption) ?? "default",
        );
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error ? e.message : "Failed to load settings",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_ai_model: defaultModel,
          default_reasoning_effort: defaultReasoningEffort,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success(
        "Default AI settings saved. They apply to all AI requests.",
      );
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
        <CardTitle>Default AI settings</CardTitle>
        <p className="text-sm text-muted-foreground">
          These apply to all AI requests across the app (matching,
          company/tender analysis, chat, etc.) when no override is provided.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Default model</span>
            <Select value={defaultModel} onValueChange={setDefaultModel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Reasoning effort</span>
            <Select
              value={defaultReasoningEffort}
              onValueChange={(v) =>
                setDefaultReasoningEffort(v as ReasoningOption)
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="minimal">Very low</SelectItem>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="xhigh">Extra high</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Lower = faster, fewer reasoning tokens
            </span>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save defaults
        </Button>
      </CardContent>
    </Card>
  );
}
