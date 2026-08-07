"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import type { CompanyRecord } from "@/lib/api/types";
import { TenderMatching } from "@/components/tenders/TenderMatching";
import { MatchesViewSwitch } from "@/components/tenders/MatchesViewSwitch";
import type { MatchesView } from "@/components/tenders/TenderMatching";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * The tenders the target company can see, rendered with the same component the
 * user gets. Per-tender deep analysis works from here: the admin's runs are
 * quota-free and, like every other admin action, send no email.
 *
 * Unlike /tenders this is not URL-driven — the console owns its own tab state,
 * so the matched/ruled-out switch is local.
 */
export function AdminTenderPreview({ companyId }: { companyId: string }) {
  const t = useTranslations("AdminPreparation");
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<MatchesView>("matched");
  const [ruledOutCount, setRuledOutCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getCompany(companyId)
      .then((data) => {
        if (!cancelled) setCompany(data.company);
      })
      .catch((error) => {
        console.error("Error loading company for tender preview:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const handleRuledOutCountChange = useCallback(
    (count: number) => setRuledOutCount(count),
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("tendersHelp")}</p>

      <MatchesViewSwitch
        value={view}
        onChange={setView}
        ruledOutCount={ruledOutCount}
      />

      <TenderMatching
        companyId={companyId}
        companyData={company ?? undefined}
        view={view}
        onViewChange={setView}
        onRuledOutCountChange={handleRuledOutCountChange}
      />
    </div>
  );
}
