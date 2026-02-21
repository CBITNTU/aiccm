"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Calendar, Globe, Building2 } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";

type TenderSource = "find-tender" | "ted" | "contracts-finder";

export function AdminTenderImport() {
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
                `Rate limited. Tried ${maxRetries} times. Please try again later.`,
              );
            }

            // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(
              `Rate limited (429). Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
            );

            toast.warning(
              `Rate limited. Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
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
          throw new Error("Superadmin access required to import tenders");
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
        `Import completed! ${totalImported} tenders imported from Find a Tender. ${totalDuplicates} duplicates skipped.`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Import error:", err);
      setError(errorMessage);
      toast.error("Import failed: " + errorMessage);
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
    } else if (source === "contracts-finder") {
      toast.info("Contracts Finder import coming soon!");
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
                `Rate limited. Tried ${maxRetries} times. Please try again later.`,
              );
            }

            // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(
              `Rate limited (429). Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
            );

            toast.warning(
              `Rate limited. Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`,
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
          throw new Error("Superadmin access required to import tenders");
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
        `Import completed! ${totalImported} tenders imported from TED. ${totalDuplicates} duplicates skipped.`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("TED Import error:", err);
      setError(errorMessage);
      toast.error("TED Import failed: " + errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Tenders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={source}
          onValueChange={(v) => setSource(v as TenderSource)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="find-tender"
              className="flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              Find a Tender
            </TabsTrigger>
            <TabsTrigger value="ted" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              TED (EU)
            </TabsTrigger>
            <TabsTrigger
              value="contracts-finder"
              className="flex items-center gap-2"
              disabled
            >
              <Globe className="w-4 h-4" />
              Contracts Finder
            </TabsTrigger>
          </TabsList>

          <TabsContent value="find-tender" className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Import tenders from the UK government&apos;s Find a Tender
                service. This will fetch active tenders and save them to the
                database.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="dateFrom" className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    From Date
                  </Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    disabled={isImporting}
                  />
                </div>
                <div>
                  <Label htmlFor="dateTo" className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    To Date
                  </Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    disabled={isImporting}
                  />
                </div>
              </div>

              {!isImporting && (
                <Button onClick={handleFindTenderImport} className="w-full">
                  Import from Find a Tender
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ted" className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Import tenders from TED (Tenders Electronic Daily) - the
                EU&apos;s official journal for public procurement. Requires API
                key from{" "}
                <a
                  href="https://docs.ted.europa.eu/api/latest/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  TED Developer Portal
                </a>
                .
              </p>

              <Alert className="mb-4">
                <AlertDescription>
                  <p className="text-sm">
                    <strong>Note:</strong> TED API requires an API key. Set{" "}
                    <code className="bg-muted px-1 rounded">TED_API_KEY</code>{" "}
                    in your environment variables. Get your API key from the{" "}
                    <a
                      href="https://docs.ted.europa.eu/api/latest/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      TED Developer Portal
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
                    From Date
                  </Label>
                  <Input
                    id="tedDateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    disabled={isImporting}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="tedDateTo"
                    className="flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    To Date
                  </Label>
                  <Input
                    id="tedDateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    disabled={isImporting}
                  />
                </div>
              </div>

              {!isImporting && (
                <Button onClick={handleTEDImport} className="w-full">
                  Import from TED
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contracts-finder" className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Import tenders from Contracts Finder (UK government contracts
                database).
              </p>
              <Alert>
                <AlertDescription>
                  Contracts Finder import is coming soon.
                </AlertDescription>
              </Alert>
            </div>
          </TabsContent>
        </Tabs>

        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-center">
              Importing from{" "}
              {source === "find-tender"
                ? "Find a Tender"
                : source === "ted"
                  ? "TED"
                  : "Contracts Finder"}
              ... {Math.round(progress)}% complete ({importedCount} imported,{" "}
              {duplicatesSkipped} skipped)
            </p>
          </div>
        )}

        {importedCount > 0 && (
          <Alert>
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Import Summary:</p>
                <p className="text-sm">Total fetched: {totalFetched}</p>
                <p className="text-sm">
                  Successfully imported: {importedCount}
                </p>
                <p className="text-sm">
                  Duplicates skipped: {duplicatesSkipped}
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
              <p className="font-medium">Import Error:</p>
              <p className="text-sm">{error}</p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
