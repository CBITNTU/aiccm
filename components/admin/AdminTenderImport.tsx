"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calendar } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";

export function AdminTenderImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [totalFetched, setTotalFetched] = useState(0);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  const handleImportTenders = async () => {
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
        maxRetries: number = 5
      ): Promise<ReturnType<typeof api.fetchUKTenders>> => {
        try {
          return await api.fetchUKTenders({
            adminImport: true,
            limit: 100,
            cursor: currentCursor,
            filters: {
              dateFrom: new Date(dateFrom).toISOString(),
              dateTo: new Date(dateTo).toISOString()
            }
          });
        } catch (err: unknown) {
          // Check if it's a 429 rate limit error
          const isRateLimit = 
            (err instanceof ApiError && err.status === 429) ||
            (err instanceof Error && (err.message.includes('429') || err.message.includes('rate limit'))) ||
            (err && typeof err === 'object' && 'status' in err && err.status === 429);

          if (isRateLimit) {
            if (attempt >= maxRetries) {
              throw new Error(`Rate limited. Tried ${maxRetries} times. Please try again later.`);
            }

            // Exponential backoff: 2^attempt seconds (2s, 4s, 8s, 16s, 32s)
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`Rate limited (429). Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
            
            toast.warning(`Rate limited. Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
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
        setProgress(Math.min(10 + (batchCount * 2), 95));

        const data = await fetchWithRetry(cursor);

        if (!data.isAdmin) {
          throw new Error('Superadmin access required to import tenders');
        }

        // When adminImport is true, the API saves to DB and returns actual counts
        const batchFetched = data.totalFetched || 0;
        const batchImported = data.actuallyImported ?? (data.tenders?.length || 0);
        const batchDuplicates = data.duplicatesSkipped || 0;
        
        console.log(`Batch ${batchCount + 1}: Fetched=${batchFetched}, Imported=${batchImported}, Duplicates=${batchDuplicates}, hasMore=${data.hasMore}, nextCursor=${data.nextCursor ? 'yes' : 'no'}`);
        
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
        
        console.log(`After batch ${batchCount + 1}: hasMore=${hasMore}, cursor=${cursor ? `"${cursor.substring(0, 20)}..."` : 'null'}, batchFetched=${batchFetched}`);
        
        // Safety check: if we got 100 results but no cursor and hasMore is false, stop
        if (batchFetched === 100 && !cursor && !data.hasMore) {
          console.log("Got 100 results but no cursor available. Cannot continue pagination.");
          hasMore = false;
        }

        batchCount++;

        // Small delay between batches to avoid rate limiting (even if not 429 yet)
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
        }
      }

      setProgress(100);

      toast.success(
        `Import completed! ${totalImported} tenders imported from Find a Tender. ${totalDuplicates} duplicates skipped.`
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Import error:', err);
      setError(errorMessage);
      toast.error('Import failed: ' + errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Tenders from Find a Tender</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Import tenders from the UK government&apos;s Find a Tender service. This will fetch active tenders and save them to the database.
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
            <Button onClick={handleImportTenders} className="w-full">
              Import Tenders
            </Button>
          )}

          {isImporting && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-center">
                Importing from Find a Tender... {Math.round(progress)}% complete
              </p>
            </div>
          )}
        </div>

        {importedCount > 0 && (
          <Alert>
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Import Summary:</p>
                <p className="text-sm">Total fetched: {totalFetched}</p>
                <p className="text-sm">Successfully imported: {importedCount}</p>
                <p className="text-sm">Duplicates skipped: {duplicatesSkipped}</p>
              </div>
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
