"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("AdminSettings.ai");
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
        setDefaultModel(data.defaultAiModel ?? "gpt-5-nano");
        setDefaultReasoningEffort(
          (data.defaultReasoningEffort as ReasoningOption) ?? "default",
        );
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t("toasts.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultAiModel: defaultModel,
          defaultReasoningEffort: defaultReasoningEffort,
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("defaultModelLabel")}</span>
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
            <span className="text-sm font-medium">{t("reasoningEffortLabel")}</span>
            <Select
              value={defaultReasoningEffort}
              onValueChange={(v) =>
                setDefaultReasoningEffort(v as ReasoningOption)
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("reasoningEffortPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("effort.default")}</SelectItem>
                <SelectItem value="low">{t("effort.low")}</SelectItem>
                <SelectItem value="minimal">{t("effort.minimal")}</SelectItem>
                <SelectItem value="none">{t("effort.none")}</SelectItem>
                <SelectItem value="medium">{t("effort.medium")}</SelectItem>
                <SelectItem value="high">{t("effort.high")}</SelectItem>
                <SelectItem value="xhigh">{t("effort.xhigh")}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{t("reasoningHint")}</span>
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
