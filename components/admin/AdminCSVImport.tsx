"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { toast } from "sonner";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface CSVRow {
  company_name: string;
  companies_house_number?: string;
  contact_email?: string;
  contact_phone?: string;
  postcode?: string;
  description?: string;
  website_url?: string;
  key_capabilities?: string;
  certifications?: string;
  full_address?: string;
  sic_codes?: string;
  [key: string]: string | undefined;
}

// Helper function to extract value from array-like strings like "['value']" or "['val1', 'val2']"
const extractFromArrayString = (value: string): string => {
  if (!value) return '';
  
  // Remove brackets and quotes
  const cleaned = value.replace(/^\[|\]$/g, '').replace(/'/g, '');
  
  // If multiple values, take the first one
  const values = cleaned.split(',').map(v => v.trim()).filter(v => v);
  return values[0] || '';
};

// Helper function to extract postcode from full address
const extractPostcode = (address: string): string => {
  if (!address) return '';
  
  // UK postcode pattern: letters, numbers, space, letters/numbers
  const postcodeMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i);
  return postcodeMatch ? postcodeMatch[1].trim().toUpperCase() : '';
};

export function AdminCSVImport() {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  // Improved CSV parser that handles quoted fields and commas within fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
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
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/"/g, ''));
    
    // Parse rows
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: CSVRow = { company_name: '' };
      
      headers.forEach((header, index) => {
        let value = (values[index] || '').replace(/^"|"$/g, '').trim();
        if (!value) return;

        // Handle array-like strings (e.g., "['value']" or "['val1', 'val2']")
        if (value.startsWith('[') && value.endsWith(']')) {
          value = extractFromArrayString(value);
        }

        // Map column names to fields
        if (header === 'companyname' || header === 'company_name' || header === 'name') {
          row.company_name = value;
        } else if (header === 'companynumber' || header === 'companies_house_number' || header === 'company_number' || header === 'ch_number') {
          row.companies_house_number = value;
        } else if (header === 'email' || header === 'contact_email') {
          row.contact_email = value;
        } else if (header === 'phone' || header === 'contact_phone' || header === 'telephone') {
          row.contact_phone = value;
        } else if (header === 'full_address' || header === 'fulladdress' || header === 'address') {
          row.full_address = value;
          // Extract postcode from full address
          const postcode = extractPostcode(value);
          if (postcode && !row.postcode) {
            row.postcode = postcode;
          }
        } else if (header === 'postcode' || header === 'post_code') {
          row.postcode = value;
        } else if (header === 'description' || header === 'desc') {
          row.description = value;
        } else if (header === 'website' || header === 'website_url' || header === 'url') {
          row.website_url = value;
        } else if (header === 'raw_capabilities' || header === 'capabilities' || header === 'key_capabilities') {
          row.key_capabilities = value;
        } else if (header === 'certifications' || header === 'certs') {
          row.certifications = value;
        } else if (header.startsWith('siccode') || header.startsWith('sic_code')) {
          // Collect SIC codes
          if (!row.sic_codes) {
            row.sic_codes = value;
          } else {
            row.sic_codes += `, ${value}`;
          }
        }
      });
      
      if (row.company_name) {
        rows.push(row);
      }
    }
    
    return rows;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error("Please select a CSV file");
      return;
    }

    setFile(selectedFile);
    setErrors([]);
    setPreview([]);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);
      
      if (parsed.length === 0) {
        toast.error("No valid data found in CSV file");
        return;
      }

      setPreview(parsed.slice(0, 5)); // Show first 5 rows as preview
      toast.success(`CSV file loaded. Found ${parsed.length} companies.`);
    } catch (error) {
      console.error("Error parsing CSV:", error);
      toast.error("Failed to parse CSV file");
    }
  };

  const handleImport = async () => {
    if (!file || !supabase) return;

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

      for (let i = 0; i < total; i++) {
        const company = companies[i];

        try {
          // Check if company already exists (by name or companies house number)
          let existing = null;
          
          if (company.company_name) {
            const { data: byName } = await supabase
              .from('companies')
              .select('id')
              .eq('company_name', company.company_name)
              .maybeSingle();
            
            existing = byName;
          }

          if (!existing && company.companies_house_number) {
            const { data: byChNumber } = await supabase
              .from('companies')
              .select('id')
              .eq('companies_house_number', company.companies_house_number)
              .maybeSingle();
            
            existing = byChNumber;
          }

          if (existing) {
            skippedCount++;
            continue;
          }

          // Extract postcode from full address if not already set
          let postcode = company.postcode;
          if (!postcode && company.full_address) {
            postcode = extractPostcode(company.full_address);
          }

          // Build description with SIC codes if available
          let description = company.description || '';
          if (company.sic_codes) {
            if (description) {
              description += `\n\nSIC Codes: ${company.sic_codes}`;
            } else {
              description = `SIC Codes: ${company.sic_codes}`;
            }
          }

          // Insert new company as system company
          // user_id is null for system companies (made nullable in migration)
          const { error } = await supabase
            .from('companies')
            .insert({
              company_name: company.company_name,
              companies_house_number: company.companies_house_number || null,
              contact_email: company.contact_email || null,
              contact_phone: company.contact_phone || null,
              postcode: postcode || null,
              address: company.full_address || null, // Store full address if available
              description: description || null,
              website_url: company.website_url || null,
              key_capabilities: company.key_capabilities || null,
              certifications: company.certifications || null,
              user_id: null, // NULL for system companies (not empty string)
              is_system_company: true,
              status: 'active'
            } as Database['public']['Tables']['companies']['Insert']);

          if (error) {
            errorList.push(`${company.company_name}: ${error.message}`);
            setErrorCount(errorList.length);
          } else {
            successCount++;
          }
        } catch (err) {
          errorList.push(`${company.company_name}: ${err instanceof Error ? err.message : String(err)}`);
          setErrorCount(errorList.length);
        }

        setImportedCount(successCount);
        setSkippedCount(skippedCount);
        setErrors(errorList);
        setProgress(((i + 1) / total) * 100);
      }

      toast.success(
        `Import completed! ${successCount} imported, ${skippedCount} skipped, ${errorList.length} errors.`
      );
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Import failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Import Companies from CSV
        </CardTitle>
        <CardDescription>
          Upload a CSV file to import companies into the system. Companies will be marked as system companies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CSV Format Info */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">Expected CSV Format:</p>
              <p className="text-sm">
                Required column: <code className="bg-muted px-1 rounded">CompanyName</code> (or <code className="bg-muted px-1 rounded">company_name</code>)
              </p>
              <p className="text-sm">
                Supported columns: <code className="bg-muted px-1 rounded">CompanyNumber</code>, <code className="bg-muted px-1 rounded">Email</code>, <code className="bg-muted px-1 rounded">Phone</code>, <code className="bg-muted px-1 rounded">Full Address</code>, <code className="bg-muted px-1 rounded">Description</code>, <code className="bg-muted px-1 rounded">Website</code>, <code className="bg-muted px-1 rounded">raw_capabilities</code>, <code className="bg-muted px-1 rounded">SICCode.SicText_1</code> (and 2, 3, 4)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Note: Array values like <code className="bg-muted px-1 rounded">['value']</code> are automatically extracted. Postcode is extracted from Full Address if provided.
              </p>
            </div>
          </AlertDescription>
        </Alert>

        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="csv-file">CSV File</Label>
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

        {/* Preview */}
        {preview.length > 0 && (
          <div className="space-y-2">
            <Label>Preview (first 5 rows)</Label>
            <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 text-xs font-medium border-b pb-2 mb-2">
                <div>Company Name</div>
                <div>Contact</div>
                <div>Location</div>
              </div>
              {preview.map((row, index) => (
                <div key={index} className="grid grid-cols-3 gap-2 text-xs py-1 border-b">
                  <div className="font-medium">{row.company_name}</div>
                  <div>{row.contact_email || row.contact_phone || '-'}</div>
                  <div>{row.postcode || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import Button */}
        {file && !isImporting && (
          <Button onClick={handleImport} className="w-full" disabled={!supabase}>
            <Upload className="w-4 h-4 mr-2" />
            Import Companies
          </Button>
        )}

        {/* Progress */}
        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <div className="flex justify-between text-sm">
              <span>
                {Math.round(progress)}% complete
              </span>
              <span>
                {importedCount} imported, {skippedCount} skipped, {errorCount} errors
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
                <p className="font-medium">Import Errors ({errors.length}):</p>
                <div className="max-h-32 overflow-y-auto">
                  {errors.slice(0, 10).map((error, index) => (
                    <p key={index} className="text-xs">{error}</p>
                  ))}
                  {errors.length > 10 && (
                    <p className="text-xs">...and {errors.length - 10} more errors</p>
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
              <p className="font-medium">Import Summary:</p>
              <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                <li>{importedCount} companies imported successfully</li>
                {skippedCount > 0 && <li>{skippedCount} companies skipped (already exist)</li>}
                {errorCount > 0 && <li>{errorCount} companies failed to import</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

