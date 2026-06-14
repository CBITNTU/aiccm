"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import { X, Plus, Tag, AlertTriangle, FolderOpen, Check, ChevronsUpDown, Loader2 } from "lucide-react";
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

interface SelectedTaxonomy {
  id: string;
  name: string;
}

export function CompanyTaxonomySelector({
  companyId,
}: CompanyTaxonomySelectorProps) {
  const t = useTranslations("CompanyTaxonomySelector");

  const [selected, setSelected] = useState<SelectedTaxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // For adding new taxonomy
  const [level1, setLevel1] = useState<string | null>(null);
  const [level2, setLevel2] = useState<string | null>(null);
  const [level3, setLevel3] = useState<string | null>(null);
  const [open1, setOpen1] = useState(false);
  const [open2, setOpen2] = useState(false);
  const [open3, setOpen3] = useState(false);

  // The full ~300-item taxonomy tree is only needed to power the "Add category"
  // picker, so defer fetching it until the owner actually opens the picker.
  // Selected categories are displayed using the names the company endpoint
  // already returns, so the overview tab no longer eagerly loads the full list.
  const pickerActive =
    open1 || open2 || open3 || !!level1 || !!level2 || !!level3;
  const {
    getLevel1,
    getLevel2,
    getLevel3,
    getTaxonomyById,
    loading: taxonomiesLoading,
  } = useTaxonomies(pickerActive);

  useEffect(() => {
    fetchCompanyTaxonomies();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when companyId changes
  }, [companyId]);

  const fetchCompanyTaxonomies = async () => {
    try {
      setLoading(true);
      const result = await api.getCompanyTaxonomies(companyId);
      setSelected(result.taxonomies ?? []);
    } catch (error) {
      console.error("Error fetching company taxonomies:", error);
      toast.error(t("toastLoadError"));
    } finally {
      setLoading(false);
    }
  };

  const addTaxonomy = async () => {
    const taxonomyToAdd = level3 || level2 || level1;
    if (!taxonomyToAdd) return;

    if (selected.some((s) => s.id === taxonomyToAdd)) {
      toast.info(t("toastAlreadySelected"));
      return;
    }

    try {
      setSaving(true);
      const newIds = [...selected.map((s) => s.id), taxonomyToAdd];
      await api.syncCompanyTaxonomies(companyId, newIds);

      const added = getTaxonomyById(taxonomyToAdd);
      setSelected((prev) => [
        ...prev,
        { id: taxonomyToAdd, name: added?.name ?? taxonomyToAdd },
      ]);
      setLevel1(null);
      setLevel2(null);
      setLevel3(null);

      toast.success(t("toastAdded"));
    } catch (error) {
      console.error("Error adding taxonomy:", error);
      toast.error(t("toastAddError"));
    } finally {
      setSaving(false);
    }
  };

  const removeTaxonomy = async (taxonomyId: string) => {
    try {
      setSaving(true);
      const newIds = selected.map((s) => s.id).filter((id) => id !== taxonomyId);
      await api.syncCompanyTaxonomies(companyId, newIds);

      setSelected((prev) => prev.filter((s) => s.id !== taxonomyId));

      toast.success(t("toastRemoved"));
    } catch (error) {
      console.error("Error removing taxonomy:", error);
      toast.error(t("toastRemoveError"));
    } finally {
      setSaving(false);
    }
  };

  const level1Options = getLevel1();
  const level2Options = level1 ? getLevel2(level1) : [];
  const level3Options = level2 ? getLevel3(level2) : [];

  if (loading) {
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
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Empty state when no categories selected */}
        {selected.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-3" />
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="text-xs mt-1">{t("emptyHint")}</p>
          </div>
        )}

        {/* Selected taxonomies */}
        {selected.length > 0 && (
          <div className="space-y-2">
            <Label>{t("yourCategoriesLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {selected.map((tax) => (
                <Badge key={tax.id} variant="secondary" className="gap-1">
                  {tax.name}
                  <button
                    onClick={() => removeTaxonomy(tax.id)}
                    disabled={saving}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Add new taxonomy */}
        <div className="space-y-4">
          <Label>{t("addCategoryLabel")}</Label>

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
                    : t("selectPrimary")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder={t("searchCategoriesPlaceholder")} />
                  <CommandList>
                    {taxonomiesLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>{t("noCategoryFound")}</CommandEmpty>
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
                      </>
                    )}
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
                      : t("selectSubCategory")}
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
                      : t("selectSpecificArea")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder={t("searchAreasPlaceholder")} />
                    <CommandList>
                      <CommandEmpty>{t("noAreaFound")}</CommandEmpty>
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
              {t("addCategoryButton")}
            </Button>

            {/* Warn only once the picker has loaded but the taxonomy table is empty */}
            {pickerActive && !taxonomiesLoading && level1Options.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t("alertNoDataTitle")}</AlertTitle>
                <AlertDescription>{t("alertNoDataDescription")}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
