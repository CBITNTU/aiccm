/**
 * Worldwide location data via country-state-city.
 * Use for operation locations: countries, states/regions, cities.
 * UK: Country (United Kingdom) → State (England, Scotland, Wales, NI) → Cities.
 */

import { Country, State, City } from "country-state-city";
import type { ICountry, IState, ICity } from "country-state-city";

export type { ICountry, IState, ICity };

export function getAllCountries(): ICountry[] {
  return Country.getAllCountries() ?? [];
}

export function getStatesOfCountry(countryCode: string): IState[] {
  return State.getStatesOfCountry(countryCode) ?? [];
}

export function getCitiesOfState(countryCode: string, stateCode: string): ICity[] {
  return City.getCitiesOfState(countryCode, stateCode) ?? [];
}

export function getCitiesOfCountry(countryCode: string): ICity[] {
  return City.getCitiesOfCountry(countryCode) ?? [];
}

/** Format a location for display/storage: "Country" or "Country › State" or "Country › State › City" */
export function formatLocationLabel(
  country: ICountry,
  state?: IState | null,
  city?: ICity | null
): string {
  if (city?.name) {
    const parts = [country.name, state?.name, city.name].filter(Boolean);
    return parts.join(" › ");
  }
  if (state?.name) {
    return `${country.name} › ${state.name}`;
  }
  return country.name;
}

/** UK country code in library */
export const UK_COUNTRY_CODE = "GB";

/**
 * UK postcode area (outcode) to suggested operation location.
 * Used to pre-tick operation locations when company has postcode but operation_locations is empty.
 * Covers common areas; others fall back to "United Kingdom".
 */
const UK_POSTCODE_AREA_TO_LOCATION: Record<string, string> = {
  // England - major areas
  NG: "United Kingdom › England › Nottingham",
  M: "United Kingdom › England › Manchester",
  L: "United Kingdom › England › Liverpool",
  B: "United Kingdom › England › Birmingham",
  S: "United Kingdom › England › Sheffield",
  LS: "United Kingdom › England › Leeds",
  OX: "United Kingdom › England › Oxford",
  CB: "United Kingdom › England › Cambridge",
  BS: "United Kingdom › England › Bristol",
  N: "United Kingdom › England › London",
  E: "United Kingdom › England › London",
  W: "United Kingdom › England › London",
  SW: "United Kingdom › England › London",
  SE: "United Kingdom › England › London",
  NW: "United Kingdom › England › London",
  EC: "United Kingdom › England › London",
  WC: "United Kingdom › England › London",
  RH: "United Kingdom › England › Redhill",
  BN: "United Kingdom › England › Brighton",
  SO: "United Kingdom › England › Southampton",
  CV: "United Kingdom › England › Coventry",
  LE: "United Kingdom › England › Leicester",
  NN: "United Kingdom › England › Northampton",
  MK: "United Kingdom › England › Milton Keynes",
  PE: "United Kingdom › England › Peterborough",
  IP: "United Kingdom › England › Ipswich",
  NR: "United Kingdom › England › Norwich",
  // Scotland
  EH: "United Kingdom › Scotland › Edinburgh",
  G: "United Kingdom › Scotland › Glasgow",
  AB: "United Kingdom › Scotland › Aberdeen",
  DD: "United Kingdom › Scotland › Dundee",
  KY: "United Kingdom › Scotland › Kirkcaldy",
  // Wales
  CF: "United Kingdom › Wales › Cardiff",
  SA: "United Kingdom › Wales › Swansea",
  LL: "United Kingdom › Wales › Llandudno",
  // Northern Ireland
  BT: "United Kingdom › Northern Ireland › Belfast",
};

/**
 * Suggest operation locations from a postcode (e.g. company's saved postcode).
 * Used to pre-tick when operation_locations is empty but organization has a location.
 * UK: maps postcode area to "United Kingdom › Region › City". Other formats: returns ["United Kingdom"] if looks UK, else [].
 */
export function suggestLocationsFromPostcode(postcode: string | null | undefined): string[] {
  if (!postcode || typeof postcode !== "string") return [];
  const trimmed = postcode.trim().toUpperCase();
  if (!trimmed.length) return [];

  // UK postcode: extract outcode (e.g. NG1, SW1A, M1, BT1)
  const ukMatch = trimmed.match(/^([A-Z]{1,2})[0-9]/);
  if (ukMatch) {
    const area = ukMatch[1];
    const suggested = UK_POSTCODE_AREA_TO_LOCATION[area];
    if (suggested) return [suggested];
    // Unknown UK area - still suggest country + nation if we can infer
    if (/^[A-Z]{1,2}[0-9]/.test(trimmed)) return ["United Kingdom"];
  }

  // Non-UK or unclear - don't guess
  return [];
}

/**
 * Suggest operation locations from the company's "Location" field (address and/or postcode).
 * Used to pre-tick when operation_locations is empty but the header Location has a value.
 * Prefers postcode (structured UK lookup); otherwise uses address text as a single location.
 */
export function suggestLocationsFromCompanyLocation(
  address: string | null | undefined,
  postcode: string | null | undefined
): string[] {
  // Prefer postcode for structured UK suggestion
  const fromPostcode = suggestLocationsFromPostcode(postcode);
  if (fromPostcode.length > 0) return fromPostcode;
  // Else use address/location text as one pre-ticked location so "Location" is reflected
  const locationText = [address, postcode].filter(Boolean).join(", ").trim();
  if (locationText) return [locationText];
  return [];
}
