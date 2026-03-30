import type { CompanyRecord } from "@/lib/api/types";

export interface ReadinessField {
  name: string;
  status: "filled" | "partial" | "missing";
  required: boolean;
  description: string;
}

export interface ReadinessResult {
  ready: boolean;
  fields: ReadinessField[];
  warnings: string[];
}

export function checkMatchingReadiness(
  company: CompanyRecord,
): ReadinessResult {
  const fields: ReadinessField[] = [];

  // Required: Description
  const hasDescription =
    !!company.description && company.description.trim().length > 20;
  const hasAiSummary =
    !!company.aiSummary && String(company.aiSummary).trim().length > 20;
  fields.push({
    name: "Company Description",
    status: hasDescription ? "filled" : hasAiSummary ? "partial" : "missing",
    required: true,
    description: hasDescription
      ? "Description is filled"
      : hasAiSummary
        ? "AI summary available — adding a manual description will improve results"
        : "Add a description in your company profile under Overview → Edit Overview",
  });

  // Required: Key Capabilities
  const hasCapabilities =
    !!company.keyCapabilities && company.keyCapabilities.trim().length > 10;
  const hasAiTaxonomy =
    Array.isArray(company.aiCapabilityTaxonomy) &&
    (company.aiCapabilityTaxonomy as unknown[]).length > 0;
  fields.push({
    name: "Key Capabilities",
    status: hasCapabilities ? "filled" : hasAiTaxonomy ? "partial" : "missing",
    required: true,
    description: hasCapabilities
      ? "Capabilities are filled"
      : hasAiTaxonomy
        ? "AI-extracted capabilities available — adding manual capabilities will improve results"
        : "Add your key capabilities in your company profile under Overview → Edit Overview",
  });

  // Required: Location
  const hasPostcode = !!company.postcode;
  const hasAddress = !!company.address;
  const hasOpLocations =
    Array.isArray(company.operationLocations) &&
    (company.operationLocations as unknown[]).length > 0;
  fields.push({
    name: "Location",
    status: hasPostcode
      ? "filled"
      : hasAddress || hasOpLocations
        ? "partial"
        : "missing",
    required: true,
    description: hasPostcode
      ? "Postcode is set"
      : hasAddress || hasOpLocations
        ? "Address or operation locations set — adding a postcode will improve location scoring"
        : "Set your postcode or address in your company profile under Basic Info",
  });

  // Recommended: Certifications
  const hasCerts =
    !!company.certifications && company.certifications.trim().length > 5;
  fields.push({
    name: "Certifications",
    status: hasCerts ? "filled" : "missing",
    required: false,
    description: hasCerts
      ? "Certifications are listed"
      : "Add certifications (ISO 9001, CHAS, etc.) in your company profile under Overview → Edit Overview",
  });

  // Recommended: Company AI Analysis
  fields.push({
    name: "Company AI Analysis",
    status: hasAiSummary ? "filled" : "missing",
    required: false,
    description: hasAiSummary
      ? "AI analysis has been run"
      : "Run 'Analyze' on your company profile to generate AI insights that improve matching",
  });

  const warnings: string[] = [];

  // Check for pending changes that won't be used in matching
  if (
    company.pendingChanges &&
    typeof company.pendingChanges === "object" &&
    Object.keys(company.pendingChanges as object).length > 0
  ) {
    warnings.push(
      "Your company has pending changes awaiting verification. Tender matching will use the currently approved data, not your draft changes. Consider waiting for approval before running analysis.",
    );
  }

  const ready = fields
    .filter((f) => f.required)
    .every((f) => f.status !== "missing");

  return { ready, fields, warnings };
}
