"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

interface ConfidenceField {
  value: string;
  confidence: number;
  evidence: string;
}

interface Certification {
  name: string;
  issuer: string;
  certId: string;
  validUntil: string;
  confidence: number;
  evidence: string;
  verified?: boolean;
}

interface Step1Data {
  companyName: string;
  companiesHouseNumber: string;
  websiteUrl: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  consentDataFetch: boolean;
  postcode?: string;
}

interface PrefillData {
  normalized?: {
    description?: { value: string; confidence: number; evidence: string };
    capabilities?: Array<ConfidenceField>;
    certifications?: Certification[];
    equipment?: Array<Record<string, unknown>>;
    sectors?: Array<ConfidenceField>;
    locations?: Array<ConfidenceField>;
    address?: { value: string; confidence: number; evidence: string };
    financial?: Record<string, { value: number; confidence: number }>;
    compliance?: Record<string, { value: string; confidence: number }>;
  };
}

interface CompanyOnboardingStep2Props {
  step1Data: Step1Data;
  prefillData: PrefillData | null;
  onBack: () => void;
}

export function CompanyOnboardingStep2({
  step1Data,
  prefillData,
  onBack,
}: CompanyOnboardingStep2Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  // Initialize state from prefill data
  const normalized = prefillData?.normalized || {};

  const [description, setDescription] = useState(
    normalized.description?.value || "",
  );
  const [capabilities, setCapabilities] = useState<string[]>(
    normalized.capabilities?.map((c) => c.value) || [],
  );
  const [newCapability, setNewCapability] = useState("");

  const [certifications, setCertifications] = useState<Certification[]>(
    normalized.certifications || [],
  );

  const [sectors, setSectors] = useState<string[]>(
    normalized.sectors?.map((s) => s.value) || [],
  );
  const [newSector, setNewSector] = useState("");

  const [locations, setLocations] = useState<string[]>(
    normalized.locations?.map((l) => l.value) || [],
  );
  const [newLocation, setNewLocation] = useState("");

  const financial = normalized.financial || {};
  const compliance = normalized.compliance || {};

  const getConfidenceDot = (confidence: number) => {
    if (confidence >= 80) return "bg-green-500";
    if (confidence >= 50) return "bg-amber-500";
    return "bg-gray-400";
  };

  const addCapability = () => {
    if (newCapability.trim()) {
      setCapabilities([...capabilities, newCapability.trim()]);
      setNewCapability("");
    }
  };

  const removeCapability = (index: number) => {
    setCapabilities(capabilities.filter((_, i) => i !== index));
  };

  const addCertification = () => {
    setCertifications([
      ...certifications,
      {
        name: "",
        issuer: "",
        certId: "",
        validUntil: "",
        confidence: 0,
        evidence: "manual",
        verified: true,
      },
    ]);
  };

  const updateCertification = (
    index: number,
    field: keyof Certification,
    value: string | boolean,
  ) => {
    const updated = [...certifications];
    updated[index] = { ...updated[index], [field]: value };
    setCertifications(updated);
  };

  const removeCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const addSector = () => {
    if (newSector.trim()) {
      setSectors([...sectors, newSector.trim()]);
      setNewSector("");
    }
  };

  const removeSector = (index: number) => {
    setSectors(sectors.filter((_, i) => i !== index));
  };

  const addLocation = () => {
    if (newLocation.trim()) {
      setLocations([...locations, newLocation.trim()]);
      setNewLocation("");
    }
  };

  const removeLocation = (index: number) => {
    setLocations(locations.filter((_, i) => i !== index));
  };

  const handleAcceptAll = () => {
    setCertifications(
      certifications.map((cert) => ({ ...cert, verified: true })),
    );
    toast.success("All Data Verified", {
      description: "All auto-filled data has been marked as verified.",
    });
  };

  const handleResetToEmpty = () => {
    if (confirm("Are you sure you want to reset all fields to empty?")) {
      setDescription("");
      setCapabilities([]);
      setCertifications([]);
      setSectors([]);
      setLocations([]);
    }
  };

  const handleSaveAndFinish = async () => {
    setIsSaving(true);

    try {
      const companyData = {
        company_name: step1Data.companyName,
        companies_house_number: step1Data.companiesHouseNumber || null,
        website_url: step1Data.websiteUrl || null,
        contact_person: step1Data.contactPerson,
        contact_email: step1Data.contactEmail,
        contact_phone: step1Data.contactPhone || null,
        consent_data_fetch: step1Data.consentDataFetch,
        description,
        key_capabilities: capabilities.join(", "),
        certifications: JSON.stringify(certifications),
        address: normalized.address?.value || null,
        postcode: step1Data.postcode || null,
        system_extracted: JSON.parse(
          JSON.stringify({
            description: normalized.description,
            capabilities: normalized.capabilities,
            certifications: normalized.certifications,
            sectors: normalized.sectors,
            locations: normalized.locations,
            address: normalized.address,
          }),
        ),
        human_verified: JSON.parse(
          JSON.stringify({
            certifications: certifications
              .filter((c) => c.verified)
              .map((c) => c.name),
          }),
        ),
        financial_data: JSON.parse(JSON.stringify(financial)),
        compliance_data: JSON.parse(JSON.stringify(compliance)),
        status: "active" as const,
      };

      const { company: createdCompany } =
        await api.createOnboardingCompanyProfile(companyData);

      // Run comprehensive AI analysis
      toast.success("Profile Created!", {
        description:
          "Running performance analysis and generating business insights...",
      });

      try {
        await api.analyzeCompany(createdCompany.id);
        toast.success("Analysis Complete!", {
          description:
            "Performance benchmarking and business insights have been generated.",
        });
      } catch (analysisError) {
        console.error("Analysis error:", analysisError);
        toast.info("Warning", {
          description:
            "Company created but analysis could not be completed. You can run it later.",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/dashboard");
    } catch (error) {
      console.error("Error saving company:", error);
      toast.error("Error", {
        description: "Failed to save company profile. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Step 2: Review & Confirm</CardTitle>
          <p className="text-muted-foreground">
            Review auto-filled data and make any necessary corrections
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleAcceptAll}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Accept All
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetToEmpty}>
              Reset to Empty
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Company Description
            {normalized.description && (
              <span className="text-sm font-normal flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${getConfidenceDot(
                    normalized.description.confidence,
                  )}`}
                />
                <a
                  href={normalized.description.evidence}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Source
                </a>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your company..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Key Capabilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {capabilities.map((cap, index) => (
              <Badge key={index} variant="secondary" className="gap-2">
                {cap}
                <button
                  onClick={() => removeCapability(index)}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCapability}
              onChange={(e) => setNewCapability(e.target.value)}
              placeholder="Add capability..."
              onKeyPress={(e) => e.key === "Enter" && addCapability()}
            />
            <Button onClick={addCapability} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Certifications
            <Button onClick={addCertification} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Row
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {certifications.map((cert, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg"
              >
                <div className="md:col-span-2">
                  <Label>
                    Name{" "}
                    <span
                      className={`w-2 h-2 inline-block rounded-full ${getConfidenceDot(
                        cert.confidence,
                      )}`}
                    />
                  </Label>
                  <Input
                    value={cert.name}
                    onChange={(e) =>
                      updateCertification(index, "name", e.target.value)
                    }
                    placeholder="Cert name"
                  />
                </div>
                <div>
                  <Label>Issuer</Label>
                  <Input
                    value={cert.issuer}
                    onChange={(e) =>
                      updateCertification(index, "issuer", e.target.value)
                    }
                    placeholder="Issuer"
                  />
                </div>
                <div>
                  <Label>Cert ID</Label>
                  <Input
                    value={cert.certId}
                    onChange={(e) =>
                      updateCertification(index, "certId", e.target.value)
                    }
                    placeholder="ID"
                  />
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={cert.validUntil}
                    onChange={(e) =>
                      updateCertification(index, "validUntil", e.target.value)
                    }
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant={cert.verified ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      updateCertification(index, "verified", !cert.verified)
                    }
                  >
                    {cert.verified ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeCertification(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sectors & Locations */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sectors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {sectors.map((sector, index) => (
                <Badge key={index} variant="secondary">
                  {sector}
                  <button onClick={() => removeSector(index)} className="ml-1">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                placeholder="Add sector..."
                onKeyPress={(e) => e.key === "Enter" && addSector()}
              />
              <Button onClick={addSector} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Locations Served</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {locations.map((location, index) => (
                <Badge key={index} variant="secondary">
                  {location}
                  <button
                    onClick={() => removeLocation(index)}
                    className="ml-1"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Add location..."
                onKeyPress={(e) => e.key === "Enter" && addLocation()}
              />
              <Button onClick={addLocation} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Data (Read-only) */}
      {Object.keys(financial).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Financial Information (Read-Only)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {Object.entries(financial).map(([key, field]) => (
                <div key={key} className="p-4 bg-muted rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {field.value?.toLocaleString() || "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${getConfidenceDot(
                        field.confidence,
                      )}`}
                    />
                    Confidence: {field.confidence}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance Data (Read-only) */}
      {Object.keys(compliance).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance Information (Read-Only)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(compliance).map(([key, field]) => (
                <div key={key} className="p-4 bg-muted rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="text-lg font-semibold mt-1">
                    {field.value || "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${getConfidenceDot(
                        field.confidence,
                      )}`}
                    />
                    Confidence: {field.confidence}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-between">
        <Button variant="outline" onClick={onBack} disabled={isSaving}>
          Back to Step 1
        </Button>
        <Button onClick={handleSaveAndFinish} disabled={isSaving}>
          {isSaving ? (
            <>
              <Save className="mr-2 h-4 w-4 animate-pulse" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save & Finish
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
