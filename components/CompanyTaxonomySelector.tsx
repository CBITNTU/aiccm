"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, Tag } from "lucide-react";
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

export function CompanyTaxonomySelector({
  companyId,
}: CompanyTaxonomySelectorProps) {
  const {
    getLevel1,
    getLevel2,
    getLevel3,
    getTaxonomyById,
    loading: taxonomiesLoading,
  } = useTaxonomies();

  const [selectedTaxonomies, setSelectedTaxonomies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // For adding new taxonomy
  const [level1, setLevel1] = useState<string | null>(null);
  const [level2, setLevel2] = useState<string | null>(null);
  const [level3, setLevel3] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyTaxonomies();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when companyId changes
  }, [companyId]);

  const fetchCompanyTaxonomies = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("company_taxonomies")
        .select("taxonomy_id")
        .eq("company_id", companyId);

      if (error) throw error;
      setSelectedTaxonomies(data?.map((ct) => ct.taxonomy_id) || []);
    } catch (error) {
      console.error("Error fetching company taxonomies:", error);
      toast.error("Failed to load your categories");
    } finally {
      setLoading(false);
    }
  };

  const addTaxonomy = async () => {
    const taxonomyToAdd = level3 || level2 || level1;
    if (!taxonomyToAdd) return;

    if (selectedTaxonomies.includes(taxonomyToAdd)) {
      toast.info("This category is already selected");
      return;
    }

    try {
      setSaving(true);
      const supabase = createClient();
      const { error } = await supabase
        .from("company_taxonomies")
        .insert({ company_id: companyId, taxonomy_id: taxonomyToAdd });

      if (error) throw error;

      setSelectedTaxonomies([...selectedTaxonomies, taxonomyToAdd]);
      setLevel1(null);
      setLevel2(null);
      setLevel3(null);

      toast.success("Category added to your profile");
    } catch (error) {
      console.error("Error adding taxonomy:", error);
      toast.error("Failed to add category");
    } finally {
      setSaving(false);
    }
  };

  const removeTaxonomy = async (taxonomyId: string) => {
    try {
      setSaving(true);
      const supabase = createClient();
      const { error } = await supabase
        .from("company_taxonomies")
        .delete()
        .eq("company_id", companyId)
        .eq("taxonomy_id", taxonomyId);

      if (error) throw error;

      setSelectedTaxonomies(
        selectedTaxonomies.filter((id) => id !== taxonomyId),
      );

      toast.success("Category removed");
    } catch (error) {
      console.error("Error removing taxonomy:", error);
      toast.error("Failed to remove category");
    } finally {
      setSaving(false);
    }
  };

  const level1Options = getLevel1();
  const level2Options = level1 ? getLevel2(level1) : [];
  const level3Options = level2 ? getLevel3(level2) : [];

  if (loading || taxonomiesLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Company Categories
        </CardTitle>
        <CardDescription>
          Select categories that best describe your company&apos;s capabilities
          and services
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
            <Select
              value={level1 || ""}
              onValueChange={(val) => {
                setLevel1(val);
                setLevel2(null);
                setLevel3(null);
              }}
            >
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
              <Select
                value={level2 || ""}
                onValueChange={(val) => {
                  setLevel2(val);
                  setLevel3(null);
                }}
              >
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
