"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
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
  type ICountry,
} from "@/lib/locationData";
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
  placeholder: placeholderProp,
}: OperationLocationsEditorProps) {
  const t = useTranslations("CompanyPage");
  const locale = useLocale();
  // Localize COUNTRY names via the built-in Intl.DisplayNames (supports any locale, no
  // extra dependency). The country-state-city library only ships English names, and it
  // has no translations for states/cities, so those remain in English.
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const localizedCountryName = (c: ICountry): string => {
    try {
      return regionNames?.of(c.isoCode) ?? c.name;
    } catch {
      return c.name;
    }
  };
  const placeholder =
    placeholderProp ?? t("operationLocations.defaultPlaceholder");
  const [countryCode, setCountryCode] = useState<string>("");
  const [stateCode, setStateCode] = useState<string>("");
  const [cityName, setCityName] = useState<string>("");
  const [customInput, setCustomInput] = useState("");

  const countries = useMemo(() => getAllCountries(), []);
  const states = useMemo(
    () => (countryCode ? getStatesOfCountry(countryCode) : []),
    [countryCode],
  );
  const cities = useMemo(
    () =>
      countryCode && stateCode ? getCitiesOfState(countryCode, stateCode) : [],
    [countryCode, stateCode],
  );

  const country = countries.find((c) => c.isoCode === countryCode);
  const state = states.find((s) => s.isoCode === stateCode);
  const city = cities.find((c) => c.name === cityName);

  const addFromSelector = () => {
    if (!country) return;
    // Save the localized country name (e.g. 中国) so the stored label matches the UI;
    // state/city segments stay English (no multilingual source available for them).
    const label = formatLocationLabel(
      { ...country, name: localizedCountryName(country) },
      state ?? undefined,
      city ?? undefined,
    );
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
                  aria-label={t("operationLocations.removeAriaLabel", {
                    location: loc,
                  })}
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
            <Select
              value={countryCode}
              onValueChange={(v) => {
                setCountryCode(v);
                setStateCode("");
                setCityName("");
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("operationLocations.country")} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.isoCode} value={c.isoCode}>
                    {localizedCountryName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={stateCode}
              onValueChange={(v) => {
                setStateCode(v);
                setCityName("");
              }}
              disabled={!countryCode}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("operationLocations.regionState")} />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.isoCode} value={s.isoCode}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={cityName}
              onValueChange={setCityName}
              disabled={!stateCode}
            >
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
                  <SelectItem value="__overflow__" disabled>
                    {t("operationLocations.moreCities", {
                      count: cities.length - 500,
                    })}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={addFromSelector}
              disabled={!canAddFromSelector}
            >
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
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), addCustom())
              }
              className="max-w-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addCustom}
              disabled={!canAddCustom}
            >
              {t("operationLocations.addCustom")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
