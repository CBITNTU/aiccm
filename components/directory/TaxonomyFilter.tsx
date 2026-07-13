"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Filter, X, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { translateTaxonomyName } from "@/lib/taxonomyTranslations";

interface TaxonomyFilterProps {
  selectedTaxonomies: string[];
  onTaxonomiesChange: (taxonomies: string[]) => void;
}

export function TaxonomyFilter({
  selectedTaxonomies,
  onTaxonomiesChange,
}: TaxonomyFilterProps) {
  const [open, setOpen] = useState(false);
  const [tempSelected, setTempSelected] =
    useState<string[]>(selectedTaxonomies);
  const [expandedLevel1, setExpandedLevel1] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedLevel2, setExpandedLevel2] = useState<Record<string, boolean>>(
    {},
  );

  const t = useTranslations("Directory");
  const locale = useLocale();
  const { getLevel1, getLevel2, getLevel3, loading } = useTaxonomies();

  const handleTaxonomyToggle = (taxonomyId: string, checked: boolean) => {
    if (checked) {
      setTempSelected([...tempSelected, taxonomyId]);
    } else {
      setTempSelected(tempSelected.filter((id) => id !== taxonomyId));
    }
  };

  const handleClearAll = () => {
    setTempSelected([]);
  };

  const handleApply = () => {
    onTaxonomiesChange(tempSelected);
    setOpen(false);
  };

  const handleCancel = () => {
    setTempSelected(selectedTaxonomies);
    setOpen(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setTempSelected(selectedTaxonomies);
    }
  };

  const toggleLevel1 = (id: string) => {
    setExpandedLevel1((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLevel2 = (id: string) => {
    setExpandedLevel2((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">{t("searchBar.loadingCategories")}</div>
    );
  }

  const level1Options = getLevel1();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>{t("taxonomyFilter.filterByCategory")}</span>
          </div>
          {selectedTaxonomies.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedTaxonomies.length} {t("taxonomyFilter.selected")}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl">{t("taxonomyFilter.selectCategories")}</DialogTitle>
          <DialogDescription>
            {t("taxonomyFilter.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">
              {tempSelected.length}{" "}
              {tempSelected.length === 1 ? t("taxonomyFilter.category") : t("taxonomyFilter.categories")}{" "}
              {t("taxonomyFilter.selected")}
            </div>
            {tempSelected.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-8"
              >
                <X className="h-4 w-4 mr-2" />
                {t("taxonomyFilter.clearAll")}
              </Button>
            )}
          </div>

          <ScrollArea className="h-[50vh] pr-4">
            <div className="space-y-2">
              {level1Options.map((level1Tax) => {
                const level2Options = getLevel2(level1Tax.id);
                const isLevel1Expanded = expandedLevel1[level1Tax.id];

                return (
                  <div
                    key={level1Tax.id}
                    className="border rounded-lg p-3 bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={level1Tax.id}
                        checked={tempSelected.includes(level1Tax.id)}
                        onCheckedChange={(checked) =>
                          handleTaxonomyToggle(level1Tax.id, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={level1Tax.id}
                        className="text-base font-semibold cursor-pointer flex-1"
                      >
                        {translateTaxonomyName(level1Tax.name, locale)}
                      </Label>
                      {level2Options.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleLevel1(level1Tax.id)}
                          className="h-8 w-8 p-0"
                        >
                          {isLevel1Expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>

                    {isLevel1Expanded && level2Options.length > 0 && (
                      <div className="ml-8 mt-3 space-y-2">
                        {level2Options.map((level2Tax) => {
                          const level3Options = getLevel3(level2Tax.id);
                          const isLevel2Expanded = expandedLevel2[level2Tax.id];

                          return (
                            <div
                              key={level2Tax.id}
                              className="border-l-2 border-muted pl-4 py-2"
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  id={level2Tax.id}
                                  checked={tempSelected.includes(level2Tax.id)}
                                  onCheckedChange={(checked) =>
                                    handleTaxonomyToggle(
                                      level2Tax.id,
                                      checked as boolean,
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={level2Tax.id}
                                  className="text-sm font-medium cursor-pointer flex-1"
                                >
                                  {translateTaxonomyName(level2Tax.name, locale)}
                                </Label>
                                {level3Options.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleLevel2(level2Tax.id)}
                                    className="h-7 w-7 p-0"
                                  >
                                    {isLevel2Expanded ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>

                              {isLevel2Expanded && level3Options.length > 0 && (
                                <div className="ml-6 mt-2 space-y-1.5">
                                  {level3Options.map((level3Tax) => (
                                    <div
                                      key={level3Tax.id}
                                      className="flex items-center gap-2"
                                    >
                                      <Checkbox
                                        id={level3Tax.id}
                                        checked={tempSelected.includes(
                                          level3Tax.id,
                                        )}
                                        onCheckedChange={(checked) =>
                                          handleTaxonomyToggle(
                                            level3Tax.id,
                                            checked as boolean,
                                          )
                                        }
                                      />
                                      <Label
                                        htmlFor={level3Tax.id}
                                        className="text-sm cursor-pointer text-muted-foreground"
                                      >
                                        {translateTaxonomyName(level3Tax.name, locale)}
                                      </Label>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={handleCancel}>
            {t("taxonomyFilter.cancel")}
          </Button>
          <Button onClick={handleApply}>
            {t("taxonomyFilter.applyFiltersPrefix")}{tempSelected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
