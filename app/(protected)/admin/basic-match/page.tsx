"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2,
  Sparkles,
  Search,
  Building2,
  FileText,
  Zap,
} from "lucide-react";

import { api } from "@/lib/api/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BasicMatch = Awaited<ReturnType<typeof api.basicMatch>>;

function bandColour(band: "high" | "medium" | "low"): string {
  switch (band) {
    case "high":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300";
    case "medium":
      return "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300";
    case "low":
      return "bg-slate-500/15 text-slate-600 border-slate-300 dark:text-slate-300";
  }
}

function ResultsTable({ data }: { data: BasicMatch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="outline" className="font-mono">
          {data.elapsedMs} ms
        </Badge>
        <span>·</span>
        <span>{data.count} matches</span>
        <span>·</span>
        <span className="font-mono text-xs">{data.mode}</span>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-12">#</th>
              <th className="px-3 py-2 w-24">Band</th>
              <th className="px-3 py-2 w-20">Score</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Buyer / Location</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r, i) => (
              <tr
                key={r.tenderId ?? r.companyId ?? i}
                className="border-t hover:bg-muted/20 transition-colors"
              >
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {i + 1}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={`uppercase text-[10px] tracking-wider ${bandColour(r.band)}`}
                  >
                    {r.band}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-xs">
                  {(r.similarity * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2 font-medium">
                  {r.title ?? r.companyName ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.buyer ? (
                    <>
                      {r.buyer}
                      {r.location ? ` · ${r.location}` : ""}
                    </>
                  ) : r.postcode ? (
                    r.postcode
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DEMO_COMPANY_NAMES = [
  "ClearSite Demolition Ltd",
  "PrecisionPoint Surveying Ltd",
  "Hazy test",
] as const;

const DEMO_QUERIES = [
  "demolition of high-rise buildings UK",
  "land surveying and geospatial mapping",
  "special educational needs education framework",
] as const;

function CompanyToTenders() {
  const [companyId, setCompanyId] = useState<string>("");
  const [limit, setLimit] = useState<number>(15);

  const companiesQ = useQuery({
    queryKey: ["admin", "basic-match", "companies"],
    queryFn: () => api.getDirectory({ limit: 200 }),
  });

  const matchMut = useMutation({
    mutationFn: (overrideCompanyId?: string) =>
      api.basicMatch({
        mode: "tenders-for-company",
        companyId: overrideCompanyId ?? companyId,
        limit,
        status: "open",
        minScore: 0.62,
        highThreshold: 0.78,
        mediumThreshold: 0.62,
      }),
  });

  const companies =
    (companiesQ.data?.companies as Array<{ id: string; companyName: string }>) ??
    [];

  const demoCompanies = DEMO_COMPANY_NAMES.map((name) =>
    companies.find((c) => c.companyName === name),
  ).filter(Boolean) as Array<{ id: string; companyName: string }>;

  return (
    <div className="space-y-4">
      {demoCompanies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center mr-1">
            Demo picks:
          </span>
          {demoCompanies.map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={companyId === c.id ? "default" : "outline"}
              onClick={() => {
                setCompanyId(c.id);
                matchMut.mutate(c.id);
              }}
            >
              {c.companyName}
            </Button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,160px,auto] gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Company
          </label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a company…" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Limit
          </label>
          <Input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 20)}
          />
        </div>
        <Button
          onClick={() => matchMut.mutate(undefined)}
          disabled={!companyId || matchMut.isPending}
        >
          {matchMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Match
        </Button>
      </div>

      {matchMut.error && (
        <div className="text-sm text-destructive">
          {matchMut.error instanceof Error
            ? matchMut.error.message
            : "Match failed"}
        </div>
      )}
      {matchMut.data && <ResultsTable data={matchMut.data} />}
    </div>
  );
}

function FreeTextSearch() {
  const [query, setQuery] = useState<string>(DEMO_QUERIES[0]);
  const [limit, setLimit] = useState<number>(15);

  const matchMut = useMutation({
    mutationFn: () =>
      api.basicMatch({
        mode: "tenders-for-query",
        query,
        limit,
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center mr-1">
          Demo queries:
        </span>
        {DEMO_QUERIES.map((q) => (
          <Button
            key={q}
            type="button"
            size="sm"
            variant={query === q ? "default" : "outline"}
            onClick={() => setQuery(q)}
          >
            {q.length > 42 ? `${q.slice(0, 40)}…` : q}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr,160px,auto] gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Search query
          </label>
          <Input
            placeholder="e.g. demolition high-rise buildings UK"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) matchMut.mutate();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Limit
          </label>
          <Input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 20)}
          />
        </div>
        <Button
          onClick={() => matchMut.mutate()}
          disabled={!query.trim() || matchMut.isPending}
        >
          {matchMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search
        </Button>
      </div>

      {matchMut.error && (
        <div className="text-sm text-destructive">
          {matchMut.error instanceof Error
            ? matchMut.error.message
            : "Search failed"}
        </div>
      )}
      {matchMut.data && <ResultsTable data={matchMut.data} />}
    </div>
  );
}

export default function BasicMatchAdminPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Basic Match</h1>
          <Badge variant="outline" className="ml-2 text-xs">
            experimental
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Coarse semantic matching backed by local{" "}
          <code className="text-xs px-1 py-0.5 rounded bg-muted">
            nomic-embed-text
          </code>{" "}
          embeddings + pgvector. No LLM calls at query time — typical latency is
          tens of milliseconds.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            How it works
          </CardTitle>
          <CardDescription className="text-sm">
            Every company and tender is embedded once into a 768-dim vector
            using a local 280&nbsp;MB model. At query time we do a single
            HNSW-indexed cosine-distance lookup, then competency-aware
            re-ranking for company → tender mode. Bands (company mode):{" "}
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">
              high ≥ 78%
            </span>
            ,{" "}
            <span className="text-amber-700 dark:text-amber-300 font-medium">
              medium ≥ 62%
            </span>
            . Use the demo picks above for a strong live story. Run{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-muted">
              npm run embed:backfill
            </code>{" "}
            after seeding new data.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Company → Tenders
          </TabsTrigger>
          <TabsTrigger value="query" className="gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Free-text search
          </TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="pt-4">
          <CompanyToTenders />
        </TabsContent>
        <TabsContent value="query" className="pt-4">
          <FreeTextSearch />
        </TabsContent>
      </Tabs>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">When to use this vs the full LLM matcher</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>
            <FileText className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
            <strong>Basic match (this page):</strong> live filtering, dashboards,
            “any tender close to my profile?”, batch shortlisting.
          </p>
          <p>
            <Sparkles className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
            <strong>Full LLM scoring:</strong> deep analysis of a specific
            short-list — the user-explicit “explain this match” action.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
