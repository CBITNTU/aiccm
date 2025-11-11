import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTaxonomies } from "@/hooks/useTaxonomies";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TaxonomyFilterProps {
  selectedTaxonomies: string[];
  onTaxonomiesChange: (taxonomies: string[]) => void;
}

export function TaxonomyFilter({
  selectedTaxonomies,
  onTaxonomiesChange,
}: TaxonomyFilterProps) {
  const { getLevel1, getLevel2, getLevel3, loading, taxonomies } = useTaxonomies();

  const handleTaxonomyToggle = (taxonomyId: string, checked: boolean) => {
    if (checked) {
      onTaxonomiesChange([...selectedTaxonomies, taxonomyId]);
    } else {
      onTaxonomiesChange(selectedTaxonomies.filter(id => id !== taxonomyId));
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading categories...</div>;
  }

  const level1Options = getLevel1();

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-6">
        {level1Options.map((level1Tax) => {
          const level2Options = getLevel2(level1Tax.id);
          
          return (
            <div key={level1Tax.id} className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={level1Tax.id}
                  checked={selectedTaxonomies.includes(level1Tax.id)}
                  onCheckedChange={(checked) => 
                    handleTaxonomyToggle(level1Tax.id, checked as boolean)
                  }
                />
                <Label
                  htmlFor={level1Tax.id}
                  className="text-sm font-semibold cursor-pointer"
                >
                  {level1Tax.name}
                </Label>
              </div>

              {level2Options.length > 0 && (
                <div className="ml-6 space-y-2">
                  {level2Options.map((level2Tax) => {
                    const level3Options = getLevel3(level2Tax.id);
                    
                    return (
                      <div key={level2Tax.id} className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={level2Tax.id}
                            checked={selectedTaxonomies.includes(level2Tax.id)}
                            onCheckedChange={(checked) => 
                              handleTaxonomyToggle(level2Tax.id, checked as boolean)
                            }
                          />
                          <Label
                            htmlFor={level2Tax.id}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {level2Tax.name}
                          </Label>
                        </div>

                        {level3Options.length > 0 && (
                          <div className="ml-6 space-y-1.5">
                            {level3Options.map((level3Tax) => (
                              <div key={level3Tax.id} className="flex items-center space-x-2">
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
  );
}
