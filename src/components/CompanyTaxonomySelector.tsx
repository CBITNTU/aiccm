import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CompanyTaxonomySelectorProps {
  companyId: string;
}

export function CompanyTaxonomySelector({ companyId }: CompanyTaxonomySelectorProps) {
  const { toast } = useToast();
  const { getLevel1, getLevel2, getLevel3, getTaxonomyById, loading: taxonomiesLoading } = useTaxonomies();
  
  const [selectedTaxonomies, setSelectedTaxonomies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // For adding new taxonomy
  const [level1, setLevel1] = useState<string | null>(null);
  const [level2, setLevel2] = useState<string | null>(null);
  const [level3, setLevel3] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyTaxonomies();
  }, [companyId]);

  const fetchCompanyTaxonomies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("company_taxonomies")
        .select("taxonomy_id")
        .eq("company_id", companyId);

      if (error) throw error;
      setSelectedTaxonomies(data?.map((ct) => ct.taxonomy_id) || []);
    } catch (error: any) {
      console.error("Error fetching company taxonomies:", error);
      toast({
        title: "Error",
        description: "Failed to load your categories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addTaxonomy = async () => {
    const taxonomyToAdd = level3 || level2 || level1;
    if (!taxonomyToAdd) return;

    if (selectedTaxonomies.includes(taxonomyToAdd)) {
      toast({
        title: "Already added",
        description: "This category is already selected",
      });
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from("company_taxonomies")
        .insert({ company_id: companyId, taxonomy_id: taxonomyToAdd });

      if (error) throw error;

      setSelectedTaxonomies([...selectedTaxonomies, taxonomyToAdd]);
      setLevel1(null);
      setLevel2(null);
      setLevel3(null);

      toast({
        title: "Success",
        description: "Category added to your profile",
      });
    } catch (error: any) {
      console.error("Error adding taxonomy:", error);
      toast({
        title: "Error",
        description: "Failed to add category",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeTaxonomy = async (taxonomyId: string) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("company_taxonomies")
        .delete()
        .eq("company_id", companyId)
        .eq("taxonomy_id", taxonomyId);

      if (error) throw error;

      setSelectedTaxonomies(selectedTaxonomies.filter((id) => id !== taxonomyId));

      toast({
        title: "Success",
        description: "Category removed",
      });
    } catch (error: any) {
      console.error("Error removing taxonomy:", error);
      toast({
        title: "Error",
        description: "Failed to remove category",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const level1Options = getLevel1();
  const level2Options = level1 ? getLevel2(level1) : [];
  const level3Options = level2 ? getLevel3(level2) : [];

  if (loading || taxonomiesLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Categories</CardTitle>
        <CardDescription>
          Select categories that best describe your company's capabilities and services
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Selected taxonomies */}
        {selectedTaxonomies.length > 0 && (
          <div className="space-y-2">
            <Label>Your Categories</Label>
            <div className="flex flex-wrap gap-2">
              {selectedTaxonomies.map((taxId) => {
                const taxonomy = getTaxonomyById(taxId);
                return taxonomy ? (
                  <Badge key={taxId} variant="secondary" className="gap-1">
                    {taxonomy.name}
                    <button
                      onClick={() => removeTaxonomy(taxId)}
                      disabled={saving}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Add new taxonomy */}
        <div className="space-y-4">
          <Label>Add Category</Label>
          
          <div className="space-y-3">
            <Select value={level1 || ""} onValueChange={(val) => {
              setLevel1(val);
              setLevel2(null);
              setLevel3(null);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select primary category" />
              </SelectTrigger>
              <SelectContent>
                {level1Options.map((tax) => (
                  <SelectItem key={tax.id} value={tax.id}>
                    {tax.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {level1 && level2Options.length > 0 && (
              <Select value={level2 || ""} onValueChange={(val) => {
                setLevel2(val);
                setLevel3(null);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {level2Options.map((tax) => (
                    <SelectItem key={tax.id} value={tax.id}>
                      {tax.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {level2 && level3Options.length > 0 && (
              <Select value={level3 || ""} onValueChange={setLevel3}>
                <SelectTrigger>
                  <SelectValue placeholder="Select specific area (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {level3Options.map((tax) => (
                    <SelectItem key={tax.id} value={tax.id}>
                      {tax.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              onClick={addTaxonomy}
              disabled={!level1 || saving}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
