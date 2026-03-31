"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
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
import { X, Plus, Tag, AlertTriangle, FolderOpen, Check, ChevronsUpDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface CompanyTaxonomySelectorProps {
  companyId: string;
}

export function CompanyTaxonomySelector({
  companyId,
}: CompanyTaxonomySelectorProps) {
  const {
    taxonomies: allTaxonomies,
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
  const [open1, setOpen1] = useState(false);
  const [open2, setOpen2] = useState(false);
  const [open3, setOpen3] = useState(false);

  useEffect(() => {
    fetchCompanyTaxonomies();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when companyId changes
  }, [companyId]);

  const fetchCompanyTaxonomies = async () => {
    try {
      setLoading(true);
      const result = await api.getCompanyTaxonomies(companyId);
      const ids = result.taxonomies?.map((t) => t.id) || [];

      setSelectedTaxonomies(ids);
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
      const newTaxonomies = [...selectedTaxonomies, taxonomyToAdd];
      await api.syncCompanyTaxonomies(companyId, newTaxonomies);

      setSelectedTaxonomies(newTaxonomies);
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
      const newTaxonomies = selectedTaxonomies.filter((id) => id !== taxonomyId);
      await api.syncCompanyTaxonomies(companyId, newTaxonomies);

      setSelectedTaxonomies(newTaxonomies);

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
        {/* Warning when no taxonomy data is available */}
        {!taxonomiesLoading && allTaxonomies.length === 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No categories available</AlertTitle>
            <AlertDescription>
              The taxonomy data has not been loaded into the database. Please
              contact an administrator to run the EIC taxonomy seed migration.
            </AlertDescription>
          </Alert>
        )}

        {/* Empty state when no categories selected */}
        {allTaxonomies.length > 0 && selectedTaxonomies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-3" />
            <p className="text-sm font-medium">No categories selected yet</p>
            <p className="text-xs mt-1">
              Add categories below to describe your company&apos;s capabilities
            </p>
          </div>
        )}

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
            <Popover open={open1} onOpenChange={setOpen1}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open1}
                  className="w-full justify-between font-normal"
                >
                  {level1
                    ? getTaxonomyById(level1)?.name
                    : "Select primary category"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search categories..." />
                  <CommandList>
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandGroup>
                      {level1Options.map((tax) => (
                        <CommandItem
                          key={tax.id}
                          value={tax.name}
                          onSelect={() => {
                            setLevel1(tax.id);
                            setLevel2(null);
                            setLevel3(null);
                            setOpen1(false);
                          }}
                        >
                          {tax.name}
                          <Check
                            className={cn(
                              "ml-auto h-4 w-4",
                              level1 === tax.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {level1 && level2Options.length > 0 && (
              <Popover open={open2} onOpenChange={setOpen2}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open2}
                    className="w-full justify-between font-normal"
                  >
                    {level2
                      ? getTaxonomyById(level2)?.name
                      : "Select sub-category (optional)"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search sub-categories..." />
                    <CommandList>
                      <CommandEmpty>No sub-category found.</CommandEmpty>
                      <CommandGroup>
                        {level2Options.map((tax) => (
                          <CommandItem
                            key={tax.id}
                            value={tax.name}
                            onSelect={() => {
                              setLevel2(tax.id);
                              setLevel3(null);
                              setOpen2(false);
                            }}
                          >
                            {tax.name}
                            <Check
                              className={cn(
                                "ml-auto h-4 w-4",
                                level2 === tax.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}

            {level2 && level3Options.length > 0 && (
              <Popover open={open3} onOpenChange={setOpen3}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open3}
                    className="w-full justify-between font-normal"
                  >
                    {level3
                      ? getTaxonomyById(level3)?.name
                      : "Select specific area (optional)"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search areas..." />
                    <CommandList>
                      <CommandEmpty>No area found.</CommandEmpty>
                      <CommandGroup>
                        {level3Options.map((tax) => (
                          <CommandItem
                            key={tax.id}
                            value={tax.name}
                            onSelect={() => {
                              setLevel3(tax.id);
                              setOpen3(false);
                            }}
                          >
                            {tax.name}
                            <Check
                              className={cn(
                                "ml-auto h-4 w-4",
                                level3 === tax.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
