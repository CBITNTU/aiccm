"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { api } from "@/lib/api/client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Zap,
  ArrowRight,
  Loader2,
  AlertCircle,
  Building2,
} from "lucide-react";

type Band = "high" | "medium" | "low";

function bandClasses(band: Band): string {
  switch (band) {
    case "high":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300";
    case "medium":
      return "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300";
    case "low":
      return "bg-slate-500/15 text-slate-600 border-slate-300 dark:text-slate-300";
  }
}

export default function MatchesPage() {
  const { user } = useAuth();
  const { selectedOrg, isLoading: orgLoading } = useOrg();
  const [limit] = useState(20);

  const matchMut = useMutation({
    mutationFn: () =>
      api.basicMatch({
        mode: "tenders-for-company",
        companyId: selectedOrg!.id,
        limit,
        status: "open",
        minScore: 0.62,
        highThreshold: 0.78,
        mediumThreshold: 0.62,
      }),
  });

  const companyId = selectedOrg?.id ?? null;
  useEffect(() => {
    if (companyId) matchMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (!user) return null;

  if (orgLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedOrg) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              No company selected
            </CardTitle>
            <CardDescription>
              You need a company profile before you can see tender matches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/onboarding">Continue onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = matchMut.data;
  const isError = !!matchMut.error;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Tender Matches</h1>
          <Badge variant="outline" className="ml-2 text-xs">
            instant
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Semantic matches for{" "}
          <span className="font-medium text-foreground">
            {selectedOrg.companyName}
          </span>
          . Refresh after editing your company description or capabilities.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => matchMut.mutate()}
          disabled={matchMut.isPending}
          size="sm"
        >
          {matchMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {matchMut.data ? "Refresh" : "Find matches"}
        </Button>
        {data && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {data.elapsedMs} ms
            </Badge>
            <span>·</span>
            <span>{data.count} matches</span>
          </div>
        )}
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link
            href={`/company/${selectedOrg.id}`}
            className="flex items-center gap-1"
          >
            Edit company profile
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium text-destructive">
                Could not run matching
              </div>
              <div className="text-muted-foreground">
                {matchMut.error instanceof Error
                  ? matchMut.error.message
                  : "Unknown error"}
                . Make sure your company profile has a description and key
                capabilities, then try again.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.results.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-2">
            <p>
              No matches returned. This usually means your company profile has
              not been indexed for semantic search yet.
            </p>
            <p>
              Open <strong>My Company</strong>, click <strong>Re-analyze</strong>{" "}
              (or save description / capabilities), then hit{" "}
              <strong>Refresh</strong> here.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => matchMut.mutate()}
                disabled={matchMut.isPending}
              >
                Refresh matches
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/company/${selectedOrg.id}`}>
                  My Company
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.results.length > 0 && data.results[0].similarity < 0.75 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Top match is below 75% — results are ranked by vector similarity plus
            your profile competencies. Update capabilities on your company page,
            then refresh.
          </CardContent>
        </Card>
      )}

      {data && data.results.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2 w-24">Band</th>
                <th className="px-3 py-2 w-20">Score</th>
                <th className="px-3 py-2 w-28">Fit</th>
                <th className="px-3 py-2">Tender</th>
                <th className="px-3 py-2">Buyer · Location</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr
                  key={r.tenderId ?? i}
                  className="border-t hover:bg-muted/20 transition-colors"
                >
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={`uppercase text-[10px] tracking-wider ${bandClasses(r.band)}`}
                    >
                      {r.band}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-xs">
                    {(r.similarity * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2">
                    {"capabilityMatch" in r && r.capabilityMatch ? (
                      <Badge variant="secondary" className="text-[10px]">
                        competency
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">semantic</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.buyer}
                    {r.location ? ` · ${r.location}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.tenderId && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/tenders/${r.tenderId}`}>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
