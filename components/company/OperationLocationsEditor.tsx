"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Plus, X } from "lucide-react";
import {
  getAllCountries,
  getStatesOfCountry,
  getCitiesOfState,
  formatLocationLabel,
} from "@/lib/locationData";
import type { ICountry, IState, ICity } from "@/lib/locationData";

interface OperationLocationsEditorProps {
  value: string[];
  onChange: (locations: string[]) => void;
  disabled?: boolean;
  /** Pre-ticked locations shown as selected; user can add/remove */
  placeholder?: string;
}

export function OperationLocationsEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Add countries, regions, or cities…",
}: OperationLocationsEditorProps) {
  const [countryCode, setCountryCode] = useState<string>("");
  const [stateCode, setStateCode] = useState<string>("");
  const [cityName, setCityName] = useState<string>("");
  const [customInput, setCustomInput] = useState("");

  const countries = useMemo(() => getAllCountries(), []);
  const states = useMemo(
    () => (countryCode ? getStatesOfCountry(countryCode) : []),
    [countryCode]
  );
  const cities = useMemo(
    () => (countryCode && stateCode ? getCitiesOfState(countryCode, stateCode) : []),
    [countryCode, stateCode]
  );

  const country = countries.find((c) => c.isoCode === countryCode);
  const state = states.find((s) => s.isoCode === stateCode);
  const city = cities.find((c) => c.name === cityName);

  const addFromSelector = () => {
    if (!country) return;
    const label = formatLocationLabel(country, state ?? undefined, city ?? undefined);
    const trimmed = label.replace(/ › $/, "").trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setCountryCode("");
      setStateCode("");
      setCityName("");
    }
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setCustomInput("");
    }
  };

  const remove = (loc: string) => {
    onChange(value.filter((l) => l !== loc));
  };

  const canAddFromSelector = !!country;
  const canAddCustom = customInput.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Selected locations (pre-ticked / saved) */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((loc) => (
            <Badge
              key={loc}
              variant="secondary"
              className="pl-2 pr-1 py-1 gap-1 font-normal"
            >
              <MapPin className="w-3 h-3" />
              {loc}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(loc)}
                  className="rounded-full hover:bg-muted p-0.5"
                  aria-label={`Remove ${loc}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {disabled ? null : (
        <>
          {/* Hierarchy: Country → State → City */}
          <div className="flex flex-wrap items-end gap-2">
            <Select value={countryCode} onValueChange={(v) => { setCountryCode(v); setStateCode(""); setCityName(""); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.isoCode} value={c.isoCode}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stateCode} onValueChange={(v) => { setStateCode(v); setCityName(""); }} disabled={!countryCode}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Region / State" />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.isoCode} value={s.isoCode}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cityName} onValueChange={setCityName} disabled={!stateCode}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                {cities.slice(0, 500).map((c) => (
                  <SelectItem key={`${c.stateCode}-${c.name}`} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
                {cities.length > 500 && (
                  <SelectItem value="" disabled>
                    +{cities.length - 500} more (type below for search)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={addFromSelector} disabled={!canAddFromSelector}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Custom location (for sub-city, or any text) */}
          <div className="flex gap-2">
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
              className="max-w-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!canAddCustom}>
              Add custom
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
