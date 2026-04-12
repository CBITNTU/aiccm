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

// Helper function to parse comma-separated capabilities
const parseCapabilities = (capabilitiesStr: string): string[] => {
  if (!capabilitiesStr) return [];

  // Split by comma and clean up
  return capabilitiesStr
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
};

// Helper function to match CSV capability to reference table (case-insensitive, fuzzy)
const matchCapability = (
  csvCapability: string,
  refCapabilities: Array<{ id: string; name: string }>,
): string | null => {
  if (!csvCapability || !refCapabilities.length) return null;

  const csvLower = csvCapability.toLowerCase().trim();

  // First try exact match (case-insensitive)
  const exactMatch = refCapabilities.find(
    (ref) => ref.name.toLowerCase() === csvLower,
  );
  if (exactMatch) return exactMatch.id;

  // Try partial match (CSV capability is contained in reference name)
  const partialMatch = refCapabilities.find(
    (ref) =>
      ref.name.toLowerCase().includes(csvLower) ||
      csvLower.includes(ref.name.toLowerCase()),
  );
  if (partialMatch) return partialMatch.id;

  // Try word-by-word matching (e.g., "CNC Machining" matches "CNC Machining", "machining" matches "CNC Machining")
  const csvWords = csvLower.split(/\s+/);
  const wordMatch = refCapabilities.find((ref) => {
    const refLower = ref.name.toLowerCase();
    // Check if all words in CSV capability appear in reference name
    return csvWords.every((word) => refLower.includes(word));
  });
  if (wordMatch) return wordMatch.id;

  return null;
};

export function AdminCSVImport() {
  const t = useTranslations("AdminCSVImport");
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
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

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setProgress(0);
    setImportedCount(0);
    setSkippedCount(0);
    setErrorCount(0);
    setErrors([]);

    try {
      const text = await file.text();
      const companies = parseCSV(text);
      const total = companies.length;
      let successCount = 0;
      let skippedCount = 0;
      const errorList: string[] = [];

      // Fetch all reference capabilities once for matching
      let capabilitiesRef: Array<{ id: string; name: string }> = [];
      try {
        const { capabilities } = await api.adminListCapabilities();
        capabilitiesRef = capabilities.map((c) => ({
          id: c.id as string,
          name: c.name as string,
        }));
      } catch (refError) {
        console.warn("Failed to fetch reference capabilities:", refError);
        toast.warning(t("toasts.capabilityMatchingDisabled"));
      }

      for (let i = 0; i < total; i++) {
        const company = companies[i];

        // Update progress immediately
        setProgress(((i + 1) / total) * 100);
        setImportedCount(successCount);
        setSkippedCount(skippedCount);
        setErrors(errorList);

        try {
          // Extract postcode from full address if not already set
          let postcode = company.postcode;
          if (!postcode && company.fullAddress) {
            postcode = extractPostcode(company.fullAddress);
          }

          // Build description with SIC codes if available
          let description = company.description || "";
          if (company.sicCodes) {
            if (description) {
              description += `\n\nSIC Codes: ${company.sicCodes}`;
            } else {
              description = `SIC Codes: ${company.sicCodes}`;
            }
          }

          // Build company data for import
          const companyData: Record<string, unknown> = {
            companyName: company.companyName,
            companiesHouseNumber: company.companiesHouseNumber || null,
            contactEmail: company.contactEmail || null,
            contactPhone: company.contactPhone || null,
            postcode: postcode || null,
            address: company.fullAddress || null,
            description: description || null,
            websiteUrl: company.websiteUrl || null,
            keyCapabilities: company.keyCapabilities || null,
            certifications: company.certifications || null,
            userId: null,
            isSystemCompany: true,
            status: "active",
          };

          // Try to import the company (the API handles dedup by name)
          const { company: importedCompany, alreadyExists } =
            await api.adminImportCompany(companyData);

          const companyId = importedCompany.id as string;

          if (alreadyExists) {
            if (updateExisting) {
              // Update existing company fields
              const updateData: Record<string, unknown> = {};
              if (company.contactEmail)
                updateData.contactEmail = company.contactEmail;
              if (company.contactPhone)
                updateData.contactPhone = company.contactPhone;
              if (postcode) updateData.postcode = postcode;
              if (company.fullAddress)
                updateData.address = company.fullAddress;
              if (description) updateData.description = description;
              if (company.websiteUrl)
                updateData.websiteUrl = company.websiteUrl;
              if (company.keyCapabilities)
                updateData.keyCapabilities = company.keyCapabilities;

              if (Object.keys(updateData).length > 0) {
                try {
                  await api.adminUpdateCompany(companyId, updateData);
                } catch (updateError) {
                  console.warn(
                    `Failed to update company ${company.companyName}:`,
                    updateError,
                  );
                }
              }

              // Smart mapping: Parse and sync capabilities
              if (company.keyCapabilities && capabilitiesRef.length > 0) {
                const csvCapabilities = parseCapabilities(
                  company.keyCapabilities,
                );
                const matchedCapabilityIds: string[] = [];

                for (const csvCap of csvCapabilities) {
                  const matchedId = matchCapability(csvCap, capabilitiesRef);
                  if (matchedId && !matchedCapabilityIds.includes(matchedId)) {
                    matchedCapabilityIds.push(matchedId);
                  }
                }

                // Sync capabilities (replaces delete + insert)
                if (matchedCapabilityIds.length > 0) {
                  try {
                    await api.syncCapabilities(companyId, matchedCapabilityIds);
                  } catch (linkError) {
                    console.warn(
                      `Failed to sync capabilities for ${company.companyName}:`,
                      linkError,
                    );
                  }
                }
              }

              // Always queue AI regeneration for CSV imports (full regeneration mode)
              // This ensures capabilities are regenerated from the base list
              try {
                const response = await fetch("/api/queue/company-ai", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    companyId,
                    jobTypes: ["company_summary", "company_taxonomy"],
                    fullRegeneration: true, // Flag for full regeneration mode
                  }),
                });
                if (!response.ok) {
                  console.warn(
                    `Failed to queue AI jobs for ${company.companyName}`,
                  );
                }
              } catch (queueError) {
                console.warn(
                  `Failed to queue AI jobs for ${company.companyName}:`,
                  queueError,
                );
              }

              successCount++;
            } else {
              // Even if skipping, still queue taxonomy generation for full regeneration
              try {
                const response = await fetch("/api/queue/company-ai", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    companyId,
                    jobTypes: ["company_taxonomy"],
                    fullRegeneration: true, // Flag for full regeneration mode
                  }),
                });
                if (!response.ok) {
                  console.warn(
                    `Failed to queue taxonomy job for ${company.companyName}`,
                  );
                }
              } catch (queueError) {
                console.warn(
                  `Failed to queue taxonomy job for ${company.companyName}:`,
                  queueError,
                );
              }

              skippedCount++;
            }
            continue;
          }

          // New company was inserted successfully
          // Smart mapping: Parse and sync capabilities
          if (company.keyCapabilities && capabilitiesRef.length > 0) {
            const csvCapabilities = parseCapabilities(company.keyCapabilities);
            const matchedCapabilityIds: string[] = [];

            for (const csvCap of csvCapabilities) {
              const matchedId = matchCapability(csvCap, capabilitiesRef);
              if (matchedId && !matchedCapabilityIds.includes(matchedId)) {
                matchedCapabilityIds.push(matchedId);
              }
            }

            // Sync capabilities
            if (matchedCapabilityIds.length > 0) {
              try {
                await api.syncCapabilities(companyId, matchedCapabilityIds);
              } catch (linkError) {
                console.warn(
                  `Failed to link capabilities for ${company.companyName}:`,
                  linkError,
                );
                // Don't fail the import, just log the warning
              }
            }
          }

          // Queue AI processing jobs for new company
          if (companyId) {
            try {
              const response = await fetch("/api/queue/company-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  companyId,
                  jobTypes: ["company_summary", "company_taxonomy"],
                }),
              });
              if (!response.ok) {
                console.warn(
                  `Failed to queue AI jobs for ${company.companyName}`,
                );
              }
            } catch (queueError) {
              console.warn(
                `Failed to queue AI jobs for ${company.companyName}:`,
                queueError,
              );
              // Don't fail the import if queueing fails
            }
          }

          successCount++;
        } catch (err) {
          errorList.push(
            `${company.companyName}: ${err instanceof Error ? err.message : String(err)}`,
          );
          setErrorCount(errorList.length);
        }

        // Final update for this iteration
        setImportedCount(successCount);
        setSkippedCount(skippedCount);
        setErrors(errorList);

        // Allow React to update the UI by yielding to the event loop
        // This ensures the progress bar updates in real-time
        if (i % 5 === 0 || i === total - 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Trigger worker to start processing company taxonomy jobs (fire and forget)
      // This will dynamically generate capabilities based on imported company data
      if (successCount > 0) {
        fetch("/api/queue/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 10, continuous: true }),
        })
          .then(() => {
            console.log("✅ Queue worker triggered after CSV import");
          })
          .catch((err) => {
            console.warn("⚠️ Failed to trigger queue worker:", err);
            // Don't fail the import if worker trigger fails
          });
      }

      toast.success(
        t("toasts.importSuccess", {
          imported: successCount,
          skipped: skippedCount,
          errors: errorList.length,
          note: successCount > 0 ? t("toasts.importSuccessNote") : "",
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
                  skipped: skippedCount,
                  errors: errorCount,
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
        {!isImporting && importedCount > 0 && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">{t("summaryTitle")}</p>
              <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                <li>{t("summaryImported", { count: importedCount })}</li>
                {skippedCount > 0 && (
                  <li>{t("summarySkipped", { count: skippedCount })}</li>
                )}
                {errorCount > 0 && (
                  <li>{t("summaryFailed", { count: errorCount })}</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
