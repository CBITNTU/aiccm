"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Calendar, Globe, Building2, MapPin } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useAdminTenderSyncOptional } from "@/components/admin/AdminTenderSyncContext";
import { useDeployment } from "@/lib/deployment/client";

type TenderSource = "find-tender" | "ted";

export function AdminTenderImport() {
  const t = useTranslations("AdminTenders.import");
  const { isSyncInProgress } = useAdminTenderSyncOptional();
  // China deployments use the Shanghai (zbycg.com) source; UK/EU use Find a Tender + TED.
  const isChina = useDeployment().id === "cn";
  const [source, setSource] = useState<TenderSource>("find-tender");
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [totalFetched, setTotalFetched] = useState(0);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [tedZeroMessage, setTedZeroMessage] = useState<string | null>(null);

  const handleFindTenderImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportedCount(0);
    setTotalFetched(0);
    setDuplicatesSkipped(0);
    setError(null);

    try {
      let cursor: string | undefined = undefined;

      // Helper function to fetch with exponential backoff on 429
      const fetchWithRetry = async (
        currentCursor: string | undefined,
        attempt: number = 1,
        maxRetries: number = 5,
      ): Promise<ReturnType<typeof api.fetchUKTenders>> => {
        try {
          return await api.fetchUKTenders({
            adminImport: true,
            limit: 100,
            cursor: currentCursor,
            filters: {
              dateFrom: new Date(dateFrom).toISOString(),
              dateTo: new Date(dateTo).toISOString(),
            },
          });
        } catch (err: unknown) {
          // Check if it's a 429 rate limit error
          const isRateLimit =
            (err instanceof ApiError && err.status === 429) ||
            (err instanceof Error &&
              (err.message.includes("429") ||
                err.message.includes("rate limit"))) ||
            (err &&
              typeof err === "object" &&
              "status" in err &&
              err.status === 429);

          if (isRateLimit) {
            if (attempt >= maxRetries) {
              throw new Error(
                t("toasts.rateLimitedRetries", { max: maxRetries }),
              );
            }

            // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(
              `Rate limited (429). Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
            );

            toast.warning(
              t("toasts.rateLimitedWaiting", {
                seconds: waitTime / 1000,
                attempt: attempt + 1,
                max: maxRetries,
              }),
            );

            await new Promise((resolve) => setTimeout(resolve, waitTime));
            return fetchWithRetry(currentCursor, attempt + 1, maxRetries);
          }
          throw err;
        }
      };
      let totalImported = 0;
      let totalFetched = 0;
      let totalDuplicates = 0;
      let batchCount = 0;
      let hasMore = true;

      // Fetch in batches until all tenders are imported
      while (hasMore) {
        // Update progress (estimate based on batches, but will complete at 100%)
        setProgress(Math.min(10 + batchCount * 2, 95));

        const data = await fetchWithRetry(cursor);

        if (!data.isAdmin) {
          throw new Error(t("toasts.adminRequired"));
        }

        // When adminImport is true, the API saves to DB and returns actual counts
        const batchFetched = data.totalFetched || 0;
        const batchImported =
          data.actuallyImported ?? (data.tenders?.length || 0);
        const batchDuplicates = data.duplicatesSkipped || 0;

        console.log(
          `Batch ${batchCount + 1}: Fetched=${batchFetched}, Imported=${batchImported}, Duplicates=${batchDuplicates}, hasMore=${data.hasMore}, nextCursor=${data.nextCursor ? "yes" : "no"}`,
        );

        totalFetched += batchFetched;
        totalImported += batchImported;
        totalDuplicates += batchDuplicates;

        // Update UI with current progress
        setTotalFetched(totalFetched);
        setImportedCount(totalImported);
        setDuplicatesSkipped(totalDuplicates);

        // Check if there are more tenders to fetch
        // If we got exactly 100 results but no cursor, we can't continue (need cursor for next page)
        hasMore = data.hasMore === true && !!data.nextCursor;
        cursor = data.nextCursor || undefined;

        console.log(
          `After batch ${batchCount + 1}: hasMore=${hasMore}, cursor=${cursor ? `"${cursor.substring(0, 20)}..."` : "null"}, batchFetched=${batchFetched}`,
        );

        // Safety check: if we got 100 results but no cursor and hasMore is false, stop
        if (batchFetched === 100 && !cursor && !data.hasMore) {
          console.log(
            "Got 100 results but no cursor available. Cannot continue pagination.",
          );
          hasMore = false;
        }

        batchCount++;

        // Small delay between batches to avoid rate limiting (even if not 429 yet)
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second between batches
        }
      }

      setProgress(100);

      toast.success(
        t("toasts.findTenderSuccess", {
          imported: totalImported,
          skipped: totalDuplicates,
        }),
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t("toasts.unknownError");
      console.error("Import error:", err);
      setError(errorMessage);
      toast.error(t("toasts.importFailed", { message: errorMessage }));
    } finally {
      setIsImporting(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future UI
  const handleImportTenders = async () => {
    if (source === "find-tender") {
      await handleFindTenderImport();
    } else if (source === "ted") {
      await handleTEDImport();
    }
  };

  const handleShanghaiImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportedCount(0);
    setTotalFetched(0);
    setDuplicatesSkipped(0);
    setError(null);

    try {
      let page = 1;
      let hasMore = true;
      let batchCount = 0;
      let totalImported = 0;
      let runningFetched = 0;
      let totalDuplicates = 0;

      while (hasMore) {
        setProgress(Math.min(10 + batchCount * 5, 95));

        const data = await api.fetchShanghaiTenders({ adminImport: true, page });

        if (!data.isAdmin) {
          throw new Error(t("toasts.adminRequired"));
        }

        const batchFetched = data.totalFetched || 0;
        const batchImported =
          data.actuallyImported ?? (data.tenders?.length || 0);
        const batchDuplicates = data.duplicatesSkipped || 0;

        totalImported += batchImported;
        runningFetched += batchFetched;
        totalDuplicates += batchDuplicates;

        setTotalFetched(runningFetched);
        setImportedCount(totalImported);
        setDuplicatesSkipped(totalDuplicates);

        hasMore = data.hasMore === true && !!data.nextPage;
        page = data.nextPage || page + 1;
        batchCount++;

        // Be polite to the scraped site between pages.
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      setProgress(100);

      toast.success(
        t("toasts.shanghaiSuccess", {
          imported: totalImported,
          skipped: totalDuplicates,
        }),
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t("toasts.unknownError");
      console.error("Shanghai import error:", err);
      setError(errorMessage);
      toast.error(t("toasts.shanghaiImportFailed", { message: errorMessage }));
    } finally {
      setIsImporting(false);
    }
  };

  const handleTEDImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setImportedCount(0);
    setTotalFetched(0);
    setDuplicatesSkipped(0);
    setError(null);
    setTedZeroMessage(null);

    try {
      let currentPage = 1;
      let nextToken: string | undefined = undefined;
      let totalImported = 0;
      let totalFetched = 0;
      let totalDuplicates = 0;
      let batchCount = 0;
      let hasMore = true;

      // Helper function to fetch with exponential backoff on 429
      const fetchWithRetry = async (
        page: number,
        token: string | undefined,
        attempt: number = 1,
        maxRetries: number = 5,
      ): Promise<ReturnType<typeof api.fetchTEDTenders>> => {
        try {
          return await api.fetchTEDTenders({
            adminImport: true,
            page: page,
            limit: 100,
            iterationNextToken: token,
            dateFrom: new Date(dateFrom).toISOString(),
            dateTo: new Date(dateTo).toISOString(),
            languages: ["ENG"],
          });
        } catch (err: unknown) {
          // Check if it's a 429 rate limit error
          const isRateLimit =
            (err instanceof ApiError && err.status === 429) ||
            (err instanceof Error &&
              (err.message.includes("429") ||
                err.message.includes("rate limit"))) ||
            (err &&
              typeof err === "object" &&
              "status" in err &&
              err.status === 429);

          if (isRateLimit) {
            if (attempt >= maxRetries) {
              throw new Error(
                t("toasts.rateLimitedRetries", { max: maxRetries }),
              );
            }

            // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(
              `Rate limited (429). Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
            );

            toast.warning(
              t("toasts.rateLimitedWaiting", {
                seconds: waitTime / 1000,
                attempt: attempt + 1,
                max: maxRetries,
              }),
            );

            await new Promise((resolve) => setTimeout(resolve, waitTime));
            return fetchWithRetry(page, token, attempt + 1, maxRetries);
          }
          throw err;
        }
      };

      // Fetch in batches until all tenders are imported
      while (hasMore) {
        // Update progress (estimate based on batches, but will complete at 100%)
        setProgress(Math.min(10 + batchCount * 2, 95));

        const data = await fetchWithRetry(currentPage, nextToken);

        if (!data.isAdmin) {
          throw new Error(t("toasts.adminRequired"));
        }

        if (batchCount === 0 && (data.totalFetched || 0) === 0 && (data as { message?: string }).message) {
          setTedZeroMessage((data as { message?: string }).message ?? null);
        }

        // When adminImport is true, the API saves to DB and returns actual counts
        const batchFetched = data.totalFetched || 0;
        const batchImported =
          data.actuallyImported ?? (data.tenders?.length || 0);
        const batchDuplicates = data.duplicatesSkipped || 0;

        console.log(
          `Batch ${batchCount + 1}: Fetched=${batchFetched}, Imported=${batchImported}, Duplicates=${batchDuplicates}, hasMore=${data.hasMore}, nextToken=${data.nextToken ? "yes" : "no"}`,
        );

        totalFetched += batchFetched;
        totalImported += batchImported;
        totalDuplicates += batchDuplicates;

        // Update UI with current progress
        setTotalFetched(totalFetched);
        setImportedCount(totalImported);
        setDuplicatesSkipped(totalDuplicates);

        // Check if there are more tenders to fetch
        // TED uses iterationNextToken for pagination
        hasMore =
          data.hasMore === true && (!!data.nextToken || !!data.nextPage);
        if (data.nextToken) {
          nextToken = data.nextToken;
        } else if (data.nextPage) {
          currentPage = data.nextPage;
          nextToken = undefined; // Reset token when using page numbers
        }

        console.log(
          `After batch ${batchCount + 1}: hasMore=${hasMore}, nextPage=${currentPage}, nextToken=${nextToken ? "exists" : "null"}, batchFetched=${batchFetched}`,
        );

        batchCount++;

        // Small delay between batches to avoid rate limiting (even if not 429 yet)
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second between batches
        }
      }

      setProgress(100);

      toast.success(
        t("toasts.tedSuccess", {
          imported: totalImported,
          skipped: totalDuplicates,
        }),
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t("toasts.unknownError");
      console.error("TED Import error:", err);
      setError(errorMessage);
      toast.error(t("toasts.tedImportFailed", { message: errorMessage }));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isChina && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("shanghaiDescription")}
            </p>
            {isSyncInProgress && (
              <p className="text-sm text-muted-foreground">
                {t("syncRunningNote")}
              </p>
            )}
            {!isImporting && (
              <Button
                onClick={handleShanghaiImport}
                className="w-full"
                disabled={isSyncInProgress}
              >
                <MapPin className="w-4 h-4 mr-2" />
                {t("shanghaiButton")}
              </Button>
            )}
          </div>
        )}

        {!isChina && (
        <Tabs
          value={source}
          onValueChange={(v) => setSource(v as TenderSource)}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="find-tender"
              className="flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              {t("tabs.findTender")}
            </TabsTrigger>
            <TabsTrigger value="ted" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {t("tabs.ted")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="find-tender" className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("findTenderDescription")}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="dateFrom" className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {t("fromDateLabel")}
                  </Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    disabled={isImporting || isSyncInProgress}
                  />
                </div>
                <div>
                  <Label htmlFor="dateTo" className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {t("toDateLabel")}
                  </Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    disabled={isImporting || isSyncInProgress}
                  />
                </div>
              </div>

              {isSyncInProgress && (
                <p className="text-sm text-muted-foreground mb-2">
                  {t("syncRunningNote")}
                </p>
              )}
              {!isImporting && (
                <Button
                  onClick={handleFindTenderImport}
                  className="w-full"
                  disabled={isSyncInProgress}
                >
                  {t("findTenderButton")}
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ted" className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("tedDescription")}
                <a
                  href="https://docs.ted.europa.eu/api/latest/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {t("tedDeveloperPortal")}
                </a>
                .
              </p>

              <Alert className="mb-4">
                <AlertDescription>
                  <p className="text-sm">
                    <strong>{t("tedNotePrefix")}</strong>
                    {t("tedNote")}
                    <code className="bg-muted px-1 rounded">{t("tedNoteEnvVar")}</code>
                    {t("tedNoteSuffix")}
                    <a
                      href="https://docs.ted.europa.eu/api/latest/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {t("tedDeveloperPortal")}
                    </a>
                    .
                  </p>
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label
                    htmlFor="tedDateFrom"
                    className="flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    {t("fromDateLabel")}
                  </Label>
                  <Input
                    id="tedDateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    disabled={isImporting || isSyncInProgress}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="tedDateTo"
                    className="flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    {t("toDateLabel")}
                  </Label>
                  <Input
                    id="tedDateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    disabled={isImporting || isSyncInProgress}
                  />
                </div>
              </div>

              {!isImporting && (
                <Button
                  onClick={handleTEDImport}
                  className="w-full"
                  disabled={isSyncInProgress}
                >
                  {t("tedButton")}
                </Button>
              )}
            </div>
          </TabsContent>

        </Tabs>
        )}

        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-center">
              {isChina
                ? t("importingShanghai", {
                    progress: Math.round(progress),
                    imported: importedCount,
                    skipped: duplicatesSkipped,
                  })
                : source === "find-tender"
                  ? t("importingFindTender", {
                      progress: Math.round(progress),
                      imported: importedCount,
                      skipped: duplicatesSkipped,
                    })
                  : t("importingTed", {
                      progress: Math.round(progress),
                      imported: importedCount,
                      skipped: duplicatesSkipped,
                    })}
            </p>
          </div>
        )}

        {importedCount > 0 && (
          <Alert>
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">{t("summaryTitle")}</p>
                <p className="text-sm">{t("summaryTotal", { count: totalFetched })}</p>
                <p className="text-sm">
                  {t("summaryImported", { count: importedCount })}
                </p>
                <p className="text-sm">
                  {t("summarySkipped", { count: duplicatesSkipped })}
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {tedZeroMessage && (
          <Alert>
            <AlertDescription>
              <p className="text-sm">{tedZeroMessage}</p>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">{t("errorTitle")}</p>
              <p className="text-sm">{error}</p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
