"use client";

/* eslint-disable react/no-unescaped-entities -- CSV row types; copy uses apostrophes */
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface CSVRow {
  companyName: string;
  companiesHouseNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  postcode?: string;
  description?: string;
  websiteUrl?: string;
  keyCapabilities?: string;
  certifications?: string;
  fullAddress?: string;
  sicCodes?: string;
  [key: string]: string | undefined;
}

interface ImportFailureRow {
  rowNumber: number;
  companyName: string;
  message: string;
}

// Helper function to extract value from array-like strings like "['value']" or "['val1', 'val2']"
const extractFromArrayString = (value: string): string => {
  if (!value) return "";

  // Remove brackets and quotes
  const cleaned = value.replace(/^\[|\]$/g, "").replace(/'/g, "");

  // If multiple values, take the first one
  const values = cleaned
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v);
  return values[0] || "";
};

// Helper function to extract postcode from full address
const extractPostcode = (address: string): string => {
  if (!address) return "";

  // UK postcode pattern: letters, numbers, space, letters/numbers
  const postcodeMatch = address.match(
    /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i,
  );
  return postcodeMatch ? postcodeMatch[1].trim().toUpperCase() : "";
};

export function AdminCSVImport() {
  const t = useTranslations("AdminCSVImport");
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [queuedJobsCount, setQueuedJobsCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [failureRows, setFailureRows] = useState<ImportFailureRow[]>([]);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [queueAiJobs, setQueueAiJobs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Improved CSV parser that handles quoted fields and commas within fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]).map((h) =>
      h.trim().toLowerCase().replace(/\s+/g, "_").replace(/"/g, ""),
    );

    // Parse rows
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: CSVRow = { companyName: "" };

      headers.forEach((header, index) => {
        let value = (values[index] || "").replace(/^"|"$/g, "").trim();
        if (!value) return;

        // Handle array-like strings (e.g., "['value']" or "['val1', 'val2']")
        if (value.startsWith("[") && value.endsWith("]")) {
          value = extractFromArrayString(value);
        }

        // Map column names to fields
        if (
          header === "companyname" ||
          header === "company_name" ||
          header === "name"
        ) {
          row.companyName = value;
        } else if (
          header === "companynumber" ||
          header === "companies_house_number" ||
          header === "company_number" ||
          header === "ch_number"
        ) {
          row.companiesHouseNumber = value;
        } else if (header === "email" || header === "contact_email") {
          row.contactEmail = value;
        } else if (
          header === "phone" ||
          header === "contact_phone" ||
          header === "telephone"
        ) {
          row.contactPhone = value;
        } else if (
          header === "full_address" ||
          header === "fulladdress" ||
          header === "address"
        ) {
          row.fullAddress = value;
          // Extract postcode from full address
          const postcode = extractPostcode(value);
          if (postcode && !row.postcode) {
            row.postcode = postcode;
          }
        } else if (header === "postcode" || header === "post_code") {
          row.postcode = value;
        } else if (header === "description" || header === "desc") {
          row.description = value;
        } else if (
          header === "website" ||
          header === "website_url" ||
          header === "url"
        ) {
          row.websiteUrl = value;
        } else if (
          header === "raw_capabilities" ||
          header === "capabilities" ||
          header === "key_capabilities"
        ) {
          row.keyCapabilities = value;
        } else if (header === "certifications" || header === "certs") {
          row.certifications = value;
        } else if (
          header.startsWith("siccode") ||
          header.startsWith("sic_code")
        ) {
          // Collect SIC codes
          if (!row.sicCodes) {
            row.sicCodes = value;
          } else {
            row.sicCodes += `, ${value}`;
          }
        }
      });

      if (row.companyName) {
        rows.push(row);
      }
    }

    return rows;
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      toast.error(t("toasts.invalidFile"));
      return;
    }

    setFile(selectedFile);
    setErrors([]);
    setPreview([]);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);

      if (parsed.length === 0) {
        toast.error(t("toasts.noData"));
        return;
      }

      setPreview(parsed.slice(0, 5)); // Show first 5 rows as preview
      toast.success(t("toasts.loaded", { count: parsed.length }));
    } catch (error) {
      console.error("Error parsing CSV:", error);
      toast.error(t("toasts.parseError"));
    }
  };

  const downloadErrorReport = () => {
    if (failureRows.length === 0) return;

    const csvHeader = "rowNumber,companyName,errorMessage";
    const csvLines = failureRows.map((failure) => {
      const escapedName = `"${failure.companyName.replace(/"/g, '""')}"`;
      const escapedMessage = `"${failure.message.replace(/"/g, '""')}"`;
      return `${failure.rowNumber},${escapedName},${escapedMessage}`;
    });

    const blob = new Blob([[csvHeader, ...csvLines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `csv-import-failures-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setProgress(0);
    setImportedCount(0);
    setUpdatedCount(0);
    setSkippedCount(0);
    setErrorCount(0);
    setQueuedJobsCount(0);
    setErrors([]);
    setFailureRows([]);

    try {
      const text = await file.text();
      const companies = parseCSV(text);
      const total = companies.length;
      if (total === 0) {
        toast.error(t("toasts.noData"));
        return;
      }

      const clientChunkSize = 250;
      let processedRows = 0;
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      let queuedJobs = 0;
      const failureList: ImportFailureRow[] = [];
      const errorList: string[] = [];

      for (let start = 0; start < companies.length; start += clientChunkSize) {
        const chunk = companies.slice(start, start + clientChunkSize);

        const payloadRows = chunk.map((company) => {
          const postcode =
            company.postcode ||
            (company.fullAddress ? extractPostcode(company.fullAddress) : null);

          return {
            companyName: company.companyName,
            companiesHouseNumber: company.companiesHouseNumber || null,
            contactEmail: company.contactEmail || null,
            contactPhone: company.contactPhone || null,
            postcode: postcode || null,
            fullAddress: company.fullAddress || null,
            description: company.description || null,
            websiteUrl: company.websiteUrl || null,
            keyCapabilities: company.keyCapabilities || null,
            certifications: company.certifications || null,
            sicCodes: company.sicCodes || null,
          };
        });

        const chunkResult = await api.adminBulkImportCompanies({
          rows: payloadRows,
          options: {
            duplicateMode: updateExisting ? "update" : "skip",
            enqueueJobs: queueAiJobs,
            fullRegeneration: true,
            chunkSize: 150,
          },
        });

        imported += chunkResult.imported;
        updated += chunkResult.updated;
        skipped += chunkResult.skipped;
        failed += chunkResult.failed;
        queuedJobs += chunkResult.queuedJobs;
        processedRows += chunk.length;

        const chunkFailures = chunkResult.results
          .filter((result) => result.status === "error")
          .map((result) => ({
            rowNumber: result.rowIndex + 2,
            companyName: result.companyName,
            message: result.message || t("errors.unknownImportError"),
          }));

        if (chunkFailures.length > 0) {
          failureList.push(...chunkFailures);
          errorList.push(
            ...chunkFailures.map(
              (failure) => `${failure.companyName}: ${failure.message}`,
            ),
          );
        }

        setProgress((processedRows / total) * 100);
        setImportedCount(imported);
        setUpdatedCount(updated);
        setSkippedCount(skipped);
        setErrorCount(failed);
        setQueuedJobsCount(queuedJobs);
        setFailureRows([...failureList]);
        setErrors([...errorList]);
      }

      if (queuedJobs > 0) {
        fetch("/api/queue/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchSize: 20,
            selfTrigger: true,
            concurrency: 10,
          }),
        }).catch(() => {
          // Jobs stay queued even if worker trigger fails.
        });
      }

      toast.success(
        t("toasts.importSuccess", {
          imported,
          updated,
          skipped,
          errors: failed,
          queued: queuedJobs,
          note: queuedJobs > 0 ? t("toasts.importSuccessNote") : "",
        }),
      );
    } catch (error) {
      console.error("Import error:", error);
      toast.error(
        t("toasts.importFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t("cardTitle")}
        </CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CSV Format Info */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">{t("format.title")}</p>
              <p className="text-sm">
                {t("format.requiredIntro")}
                <code className="bg-muted px-1 rounded">CompanyName</code>
                {t("format.requiredOr")}
                <code className="bg-muted px-1 rounded">company_name</code>
                {t("format.requiredOrEnd")}
              </p>
              <p className="text-sm">
                {t("format.supportedIntro")}
                <code className="bg-muted px-1 rounded">CompanyNumber</code>,{" "}
                <code className="bg-muted px-1 rounded">Email</code>,{" "}
                <code className="bg-muted px-1 rounded">Phone</code>,{" "}
                <code className="bg-muted px-1 rounded">Full Address</code>,{" "}
                <code className="bg-muted px-1 rounded">Description</code>,{" "}
                <code className="bg-muted px-1 rounded">Website</code>,{" "}
                <code className="bg-muted px-1 rounded">raw_capabilities</code>,{" "}
                <code className="bg-muted px-1 rounded">SICCode.SicText_1</code>
                {t("format.supportedSuffix")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("format.note")}
                <code className="bg-muted px-1 rounded">['value']</code>
                {t("noteSuffix")}
              </p>
            </div>
          </AlertDescription>
        </Alert>

        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="csv-file">{t("fileLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              ref={fileInputRef}
              disabled={isImporting}
              className="flex-1"
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                {file.name}
              </div>
            )}
          </div>
        </div>

        {/* Update Existing Companies Option */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="update-existing"
            checked={updateExisting}
            onCheckedChange={(checked) => setUpdateExisting(checked === true)}
            disabled={isImporting}
          />
          <Label
            htmlFor="update-existing"
            className="text-sm font-normal cursor-pointer"
          >
            {t("updateExistingLabel")}
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="queue-ai-jobs"
            checked={queueAiJobs}
            onCheckedChange={(checked) => setQueueAiJobs(checked === true)}
            disabled={isImporting}
          />
          <Label
            htmlFor="queue-ai-jobs"
            className="text-sm font-normal cursor-pointer"
          >
            {t("queueAiJobsLabel")}
          </Label>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="space-y-2">
            <Label>{t("previewLabel")}</Label>
            <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 text-xs font-medium border-b pb-2 mb-2">
                <div>{t("previewHeader.companyName")}</div>
                <div>{t("previewHeader.contact")}</div>
                <div>{t("previewHeader.location")}</div>
              </div>
              {preview.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-3 gap-2 text-xs py-1 border-b"
                >
                  <div className="font-medium">{row.companyName}</div>
                  <div>{row.contactEmail || row.contactPhone || "-"}</div>
                  <div>{row.postcode || "-"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import Button */}
        {file && !isImporting && (
          <Button
            onClick={handleImport}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {t("importButton")}
          </Button>
        )}

        {/* Progress */}
        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <div className="flex justify-between text-sm">
              <span>{t("progressLabel", { progress: Math.round(progress) })}</span>
              <span>
                {t("progressCounts", {
                  imported: importedCount,
                  updated: updatedCount,
                  skipped: skippedCount,
                  errors: errorCount,
                  queued: queuedJobsCount,
                })}
              </span>
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">{t("errorsTitle", { count: errors.length })}</p>
                <div className="max-h-32 overflow-y-auto">
                  {errors.slice(0, 10).map((error, index) => (
                    <p key={index} className="text-xs">
                      {error}
                    </p>
                  ))}
                  {errors.length > 10 && (
                    <p className="text-xs">
                      {t("moreErrors", { count: errors.length - 10 })}
                    </p>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Success Summary */}
        {!isImporting &&
          (importedCount > 0 ||
            updatedCount > 0 ||
            skippedCount > 0 ||
            errorCount > 0) && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">{t("summaryTitle")}</p>
              <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                <li>{t("summaryImported", { count: importedCount })}</li>
                {updatedCount > 0 && (
                  <li>{t("summaryUpdated", { count: updatedCount })}</li>
                )}
                {skippedCount > 0 && (
                  <li>{t("summarySkipped", { count: skippedCount })}</li>
                )}
                {errorCount > 0 && (
                  <li>{t("summaryFailed", { count: errorCount })}</li>
                )}
                {queuedJobsCount > 0 && (
                  <li>{t("summaryQueued", { count: queuedJobsCount })}</li>
                )}
              </ul>
              {failureRows.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={downloadErrorReport}
                >
                  {t("downloadFailureReport")}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
