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
  options?: { taxonomyCount?: number; standardsCount?: number; capabilitiesCount?: number },
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
  const structuredCapabilitiesCount = options?.capabilitiesCount ?? 0;
  const hasCapabilities =
    (!!company.keyCapabilities && company.keyCapabilities.trim().length > 10) ||
    structuredCapabilitiesCount > 0;
  const hasAiTaxonomy =
    Array.isArray(company.aiCapabilityTaxonomy) &&
    (company.aiCapabilityTaxonomy as unknown[]).length > 0;
  fields.push({
    name: "Key Capabilities",
    status: hasCapabilities ? "filled" : hasAiTaxonomy ? "partial" : "missing",
    required: true,
    description: hasCapabilities
      ? structuredCapabilitiesCount > 0 && company.keyCapabilities && company.keyCapabilities.trim().length > 10
        ? `Capabilities listed and ${structuredCapabilitiesCount} competenc${structuredCapabilitiesCount === 1 ? "y" : "ies"} selected`
        : structuredCapabilitiesCount > 0
          ? `${structuredCapabilitiesCount} competenc${structuredCapabilitiesCount === 1 ? "y" : "ies"} selected`
          : "Capabilities are filled"
      : hasAiTaxonomy
        ? "AI-extracted capabilities available — adding manual capabilities will improve results"
        : "Add your key capabilities under Overview → Edit Overview, or select competencies in the Capabilities tab",
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

  // Recommended: Certifications (free-text OR structured standards from Capabilities tab)
  const hasFreetextCerts =
    !!company.certifications && company.certifications.trim().length > 5;
  const structuredStandardsCount = options?.standardsCount ?? 0;
  const hasCerts = hasFreetextCerts || structuredStandardsCount > 0;
  fields.push({
    name: "Certifications",
    status: hasCerts ? "filled" : "missing",
    required: false,
    description: hasCerts
      ? hasFreetextCerts && structuredStandardsCount > 0
        ? `Certifications listed and ${structuredStandardsCount} standard${structuredStandardsCount === 1 ? "" : "s"} selected`
        : hasFreetextCerts
          ? "Certifications are listed"
          : `${structuredStandardsCount} standard${structuredStandardsCount === 1 ? "" : "s"} selected`
      : "Add certifications in your company profile under Capabilities → Standards & Certifications",
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

  // Recommended: Past Projects
  let hasPastProjects = false;
  if (company.pastProjects && company.pastProjects.trim().length > 0) {
    try {
      const parsed = JSON.parse(company.pastProjects);
      hasPastProjects = Array.isArray(parsed) && parsed.length > 0;
    } catch {
      // Legacy plain text counts as filled
      hasPastProjects = company.pastProjects.trim().length > 10;
    }
  }
  fields.push({
    name: "Past Projects",
    status: hasPastProjects ? "filled" : "missing",
    required: false,
    description: hasPastProjects
      ? "Past project history is available"
      : "Add past project entries in the Experience tab to improve experience scoring",
  });

  // Recommended: Industry Category
  const taxonomyCount = options?.taxonomyCount ?? 0;
  fields.push({
    name: "Industry Category",
    status: taxonomyCount > 0 ? "filled" : "missing",
    required: false,
    description:
      taxonomyCount > 0
        ? `${taxonomyCount} industry ${taxonomyCount === 1 ? "category" : "categories"} selected`
        : "Select industry categories in the Overview tab to help the AI identify sector alignment",
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
