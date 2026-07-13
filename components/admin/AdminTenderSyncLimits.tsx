"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

export function AdminTenderSyncLimits() {
  const t = useTranslations("AdminTenders.limits");
  const [shanghai, setShanghai] = useState(300);
  const [findTender, setFindTender] = useState(1000);
  const [ted, setTed] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.adminGetTenderLimits();
        if (cancelled) return;
        setShanghai(data.shanghai_zbycg ?? 300);
        setFindTender(data.find_tender ?? 1000);
        setTed(data.ted ?? 1000);
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
      await api.adminUpdateTenderLimits({
        shanghai_zbycg: shanghai,
        find_tender: findTender,
        ted: ted,
      });
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tender-limit-shanghai">{t("fields.shanghai")}</Label>
            <Input
              id="tender-limit-shanghai"
              type="number"
              min={1}
              value={shanghai}
              onChange={(e) => setShanghai(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tender-limit-find-tender">{t("fields.findTender")}</Label>
            <Input
              id="tender-limit-find-tender"
              type="number"
              min={1}
              value={findTender}
              onChange={(e) => setFindTender(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tender-limit-ted">{t("fields.ted")}</Label>
            <Input
              id="tender-limit-ted"
              type="number"
              min={1}
              value={ted}
              onChange={(e) => setTed(parseInt(e.target.value) || 1)}
            />
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
