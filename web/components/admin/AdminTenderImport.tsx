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
import { api } from "@/lib/api/client";

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
      setProgress(30);

      // Call the API with admin import flag
      const data = await api.fetchUKTenders({
        adminImport: true,
        limit: 100,
        filters: {
          dateFrom: new Date(dateFrom).toISOString(),
          dateTo: new Date(dateTo).toISOString()
        }
      });

      setProgress(90);

      if (!data.isAdmin) {
        throw new Error('Superadmin access required to import tenders');
      }

      setTotalFetched(data.totalFetched || 0);
      setImportedCount(data.tenders?.length || 0);
      setDuplicatesSkipped(data.duplicatesSkipped || 0);
      setProgress(100);

      toast.success(
        `Import completed! ${data.tenders?.length || 0} tenders fetched from Find a Tender. ${data.duplicatesSkipped || 0} duplicates skipped.`
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
