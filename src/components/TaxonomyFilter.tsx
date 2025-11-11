import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaxonomies } from "@/hooks/useTaxonomies";

interface TaxonomyFilterProps {
  level1: string | null;
  level2: string | null;
  level3: string | null;
  onLevel1Change: (value: string | null) => void;
  onLevel2Change: (value: string | null) => void;
  onLevel3Change: (value: string | null) => void;
}

export function TaxonomyFilter({
  level1,
  level2,
  level3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
}: TaxonomyFilterProps) {
  const { getLevel1, getLevel2, getLevel3, loading } = useTaxonomies();

  const level1Options = getLevel1();
  const level2Options = level1 ? getLevel2(level1) : [];
  const level3Options = level2 ? getLevel3(level2) : [];

  const handleLevel1Change = (value: string) => {
    const newValue = value === "all" ? null : value;
    onLevel1Change(newValue);
    onLevel2Change(null);
    onLevel3Change(null);
  };

  const handleLevel2Change = (value: string) => {
    const newValue = value === "all" ? null : value;
    onLevel2Change(newValue);
    onLevel3Change(null);
  };

  const handleLevel3Change = (value: string) => {
    const newValue = value === "all" ? null : value;
    onLevel3Change(newValue);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading categories...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Primary Category</Label>
        <Select value={level1 || "all"} onValueChange={handleLevel1Change}>
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {level1Options.map((tax) => (
              <SelectItem key={tax.id} value={tax.id}>
                {tax.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {level1 && level2Options.length > 0 && (
        <div className="space-y-2">
          <Label>Sub-Category</Label>
          <Select value={level2 || "all"} onValueChange={handleLevel2Change}>
            <SelectTrigger>
              <SelectValue placeholder="All sub-categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sub-categories</SelectItem>
              {level2Options.map((tax) => (
                <SelectItem key={tax.id} value={tax.id}>
                  {tax.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {level2 && level3Options.length > 0 && (
        <div className="space-y-2">
          <Label>Specific Area</Label>
          <Select value={level3 || "all"} onValueChange={handleLevel3Change}>
            <SelectTrigger>
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {level3Options.map((tax) => (
                <SelectItem key={tax.id} value={tax.id}>
                  {tax.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
