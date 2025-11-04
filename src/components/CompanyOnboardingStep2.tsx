import { useState } from "react";
import { CheckCircle2, AlertCircle, ExternalLink, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface ConfidenceField {
  value: any;
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

interface Equipment {
  name: string;
  model: string;
  capacity: string;
  notes: string;
  confidence: number;
  evidence: string;
  verified?: boolean;
}

interface CompanyOnboardingStep2Props {
  step1Data: any;
  prefillData: any;
  onBack: () => void;
}

const CompanyOnboardingStep2 = ({ step1Data, prefillData, onBack }: CompanyOnboardingStep2Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);

  // Initialize state from prefill data
  const normalized = prefillData?.normalized || {};
  
  // Debug logging
  console.log('=== Step 2 Debug ===');
  console.log('prefillData:', prefillData);
  console.log('normalized:', normalized);
  console.log('normalized.financial:', normalized.financial);
  console.log('normalized.compliance:', normalized.compliance);
  
  // Also check for existing saved data from database (in case user is editing)
  const existingFinancial = step1Data?.existingCompany?.financial_data || {};
  const existingCompliance = step1Data?.existingCompany?.compliance_data || {};
  
  const [description, setDescription] = useState(normalized.description?.value || "");
  const [capabilities, setCapabilities] = useState<string[]>(
    normalized.capabilities?.map((c: ConfidenceField) => c.value) || []
  );
  const [newCapability, setNewCapability] = useState("");
  
  const [certifications, setCertifications] = useState<Certification[]>(
    normalized.certifications || []
  );
  
  const [equipment, setEquipment] = useState<Equipment[]>(
    normalized.equipment || []
  );
  
  const [sectors, setSectors] = useState<string[]>(
    normalized.sectors?.map((s: ConfidenceField) => s.value) || []
  );
  const [newSector, setNewSector] = useState("");
  
  const [locations, setLocations] = useState<string[]>(
    normalized.locations?.map((l: ConfidenceField) => l.value) || []
  );
  const [newLocation, setNewLocation] = useState("");

  // Merge prefill data with existing saved data
  const financial = Object.keys(normalized.financial || {}).length > 0 
    ? normalized.financial 
    : existingFinancial;
  const compliance = Object.keys(normalized.compliance || {}).length > 0 
    ? normalized.compliance 
    : existingCompliance;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 50) return "text-amber-600";
    return "text-gray-400";
  };

  const getConfidenceDot = (confidence: number) => {
    if (confidence >= 80) return "🟢";
    if (confidence >= 50) return "🟡";
    return "⚪";
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
      { name: "", issuer: "", certId: "", validUntil: "", confidence: 0, evidence: "manual", verified: true }
    ]);
  };

  const updateCertification = (index: number, field: keyof Certification, value: any) => {
    const updated = [...certifications];
    updated[index] = { ...updated[index], [field]: value };
    setCertifications(updated);
  };

  const removeCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const addEquipment = () => {
    setEquipment([
      ...equipment,
      { name: "", model: "", capacity: "", notes: "", confidence: 0, evidence: "manual", verified: true }
    ]);
  };

  const updateEquipment = (index: number, field: keyof Equipment, value: any) => {
    const updated = [...equipment];
    updated[index] = { ...updated[index], [field]: value };
    setEquipment(updated);
  };

  const removeEquipment = (index: number) => {
    setEquipment(equipment.filter((_, i) => i !== index));
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
    setCertifications(certifications.map(cert => ({ ...cert, verified: true })));
    setEquipment(equipment.map(eq => ({ ...eq, verified: true })));
    toast({
      title: "All Data Verified",
      description: "All auto-filled data has been marked as verified.",
    });
  };

  const handleResetToEmpty = () => {
    if (confirm("Are you sure you want to reset all fields to empty?")) {
      setDescription("");
      setCapabilities([]);
      setCertifications([]);
      setEquipment([]);
      setSectors([]);
      setLocations([]);
    }
  };

  const handleSaveAndFinish = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to save your company profile.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const companyData = {
        user_id: user.id,
        company_name: step1Data.companyName,
        companies_house_number: step1Data.companiesHouseNumber,
        website_url: step1Data.websiteUrl,
        contact_person: step1Data.contactPerson,
        contact_email: step1Data.contactEmail,
        contact_phone: step1Data.contactPhone,
        consent_data_fetch: step1Data.consentDataFetch,
        description,
        key_capabilities: capabilities.join(', '),
        certifications: JSON.stringify(certifications),
        equipment: JSON.stringify(equipment),
        system_extracted: {
          description: normalized.description,
          capabilities: normalized.capabilities,
          certifications: normalized.certifications,
          equipment: normalized.equipment,
          sectors: normalized.sectors,
          locations: normalized.locations,
        },
        human_verified: {
          certifications: certifications.filter(c => c.verified).map(c => c.name),
          equipment: equipment.filter(e => e.verified).map(e => e.name),
        },
        financial_data: financial,
        compliance_data: compliance,
        status: 'active',
      };

      const { error } = await supabase
        .from('companies')
        .insert(companyData);

      if (error) {
        throw error;
      }

      toast({
        title: "Success!",
        description: "Your company profile has been created successfully.",
      });

      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving company:', error);
      toast({
        title: "Error",
        description: "Failed to save company profile. Please try again.",
        variant: "destructive",
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
              <span className="text-sm font-normal">
                {getConfidenceDot(normalized.description.confidence)}
                <a
                  href={normalized.description.evidence}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-blue-600 hover:underline inline-flex items-center gap-1"
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
                <button onClick={() => removeCapability(index)} className="ml-1 hover:text-destructive">
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
              onKeyPress={(e) => e.key === 'Enter' && addCapability()}
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
              <div key={index} className="grid grid-cols-6 gap-4 p-4 border rounded-lg">
                <div className="col-span-2">
                  <Label>Name {getConfidenceDot(cert.confidence)}</Label>
                  <Input
                    value={cert.name}
                    onChange={(e) => updateCertification(index, 'name', e.target.value)}
                    placeholder="Cert name"
                  />
                </div>
                <div>
                  <Label>Issuer</Label>
                  <Input
                    value={cert.issuer}
                    onChange={(e) => updateCertification(index, 'issuer', e.target.value)}
                    placeholder="Issuer"
                  />
                </div>
                <div>
                  <Label>Cert ID</Label>
                  <Input
                    value={cert.certId}
                    onChange={(e) => updateCertification(index, 'certId', e.target.value)}
                    placeholder="ID"
                  />
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={cert.validUntil}
                    onChange={(e) => updateCertification(index, 'validUntil', e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant={cert.verified ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateCertification(index, 'verified', !cert.verified)}
                  >
                    {cert.verified ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
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

      {/* Equipment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Equipment & Resources
            <Button onClick={addEquipment} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Row
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {equipment.map((eq, index) => (
              <div key={index} className="grid grid-cols-6 gap-4 p-4 border rounded-lg">
                <div className="col-span-2">
                  <Label>Machine/Tool {getConfidenceDot(eq.confidence)}</Label>
                  <Input
                    value={eq.name}
                    onChange={(e) => updateEquipment(index, 'name', e.target.value)}
                    placeholder="Equipment name"
                  />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    value={eq.model}
                    onChange={(e) => updateEquipment(index, 'model', e.target.value)}
                    placeholder="Model"
                  />
                </div>
                <div>
                  <Label>Capacity</Label>
                  <Input
                    value={eq.capacity}
                    onChange={(e) => updateEquipment(index, 'capacity', e.target.value)}
                    placeholder="Capacity"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={eq.notes}
                    onChange={(e) => updateEquipment(index, 'notes', e.target.value)}
                    placeholder="Notes"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant={eq.verified ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateEquipment(index, 'verified', !eq.verified)}
                  >
                    {eq.verified ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeEquipment(index)}
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
                  <button onClick={() => removeSector(index)} className="ml-1">×</button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                placeholder="Add sector..."
                onKeyPress={(e) => e.key === 'Enter' && addSector()}
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
                  <button onClick={() => removeLocation(index)} className="ml-1">×</button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Add location..."
                onKeyPress={(e) => e.key === 'Enter' && addLocation()}
              />
              <Button onClick={addLocation} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Data (Read-only) */}
      {financial && Object.keys(financial).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Financial Information (Read-Only)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {Object.entries(financial).map(([key, field]: [string, any]) => (
                <div key={key} className="p-4 bg-muted rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {field.value?.toLocaleString() || 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getConfidenceDot(field.confidence)} Confidence: {field.confidence}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance Data (Read-only) */}
      {compliance && Object.keys(compliance).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance Information (Read-Only)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(compliance).map(([key, field]: [string, any]) => (
                <div key={key} className="p-4 bg-muted rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-lg font-semibold mt-1">
                    {field.value || 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getConfidenceDot(field.confidence)} Confidence: {field.confidence}%
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
          ← Back to Step 1
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
};

export default CompanyOnboardingStep2;