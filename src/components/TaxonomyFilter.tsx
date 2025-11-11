import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";

interface TaxonomyFilterProps {
  selectedTaxonomies: string[];
  onTaxonomiesChange: (taxonomies: string[]) => void;
}

export function TaxonomyFilter({
  selectedTaxonomies,
  onTaxonomiesChange,
}: TaxonomyFilterProps) {
  const { getLevel1, getLevel2, getLevel3, getTaxonomyById, loading } = useTaxonomies();

  const handleTaxonomyToggle = (taxonomyId: string, checked: boolean) => {
    if (checked) {
      onTaxonomiesChange([...selectedTaxonomies, taxonomyId]);
    } else {
      onTaxonomiesChange(selectedTaxonomies.filter(id => id !== taxonomyId));
    }
  };

  const handleClearAll = () => {
    onTaxonomiesChange([]);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading categories...</div>;
  }

  const level1Options = getLevel1();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>Filter by Category</span>
          </div>
          {selectedTaxonomies.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedTaxonomies.length} selected
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 bg-background border shadow-lg z-50" align="start">
        <div className="p-4 border-b flex items-center justify-between bg-background">
          <h4 className="font-semibold text-sm">Select Categories</h4>
          {selectedTaxonomies.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-8 px-2 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Clear All
            </Button>
          )}
        </div>
        
        <ScrollArea className="h-[450px] bg-background">
          <Accordion type="multiple" className="w-full px-4">
            {level1Options.map((level1Tax) => {
              const level2Options = getLevel2(level1Tax.id);
              
              return (
                <AccordionItem key={level1Tax.id} value={level1Tax.id} className="border-b">
                  <div className="flex items-center gap-2 py-2">
                    <Checkbox
                      id={level1Tax.id}
                      checked={selectedTaxonomies.includes(level1Tax.id)}
                      onCheckedChange={(checked) => 
                        handleTaxonomyToggle(level1Tax.id, checked as boolean)
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Label
                      htmlFor={level1Tax.id}
                      className="text-sm font-semibold cursor-pointer flex-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {level1Tax.name}
                    </Label>
                    {level2Options.length > 0 && (
                      <AccordionTrigger className="hover:no-underline py-0 h-auto" />
                    )}
                  </div>

                  {level2Options.length > 0 && (
                    <AccordionContent className="pb-2">
                      <Accordion type="multiple" className="ml-4">
                        {level2Options.map((level2Tax) => {
                          const level3Options = getLevel3(level2Tax.id);
                          
                          return (
                            <AccordionItem key={level2Tax.id} value={level2Tax.id} className="border-b">
                              <div className="flex items-center gap-2 py-2">
                                <Checkbox
                                  id={level2Tax.id}
                                  checked={selectedTaxonomies.includes(level2Tax.id)}
                                  onCheckedChange={(checked) => 
                                    handleTaxonomyToggle(level2Tax.id, checked as boolean)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <Label
                                  htmlFor={level2Tax.id}
                                  className="text-sm font-medium cursor-pointer flex-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {level2Tax.name}
                                </Label>
                                {level3Options.length > 0 && (
                                  <AccordionTrigger className="hover:no-underline py-0 h-auto" />
                                )}
                              </div>

                              {level3Options.length > 0 && (
                                <AccordionContent className="pb-2">
                                  <div className="ml-4 space-y-2">
                                    {level3Options.map((level3Tax) => (
                                      <div key={level3Tax.id} className="flex items-center gap-2 py-1">
                                        <Checkbox
                                          id={level3Tax.id}
                                          checked={selectedTaxonomies.includes(level3Tax.id)}
                                          onCheckedChange={(checked) => 
                                            handleTaxonomyToggle(level3Tax.id, checked as boolean)
                                          }
                                        />
                                        <Label
                                          htmlFor={level3Tax.id}
                                          className="text-sm cursor-pointer text-muted-foreground"
                                        >
                                          {level3Tax.name}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                </AccordionContent>
                              )}
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </AccordionContent>
                  )}
                </AccordionItem>
              );
            })}
          </Accordion>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
