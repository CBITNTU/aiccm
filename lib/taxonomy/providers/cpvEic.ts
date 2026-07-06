import {
  cpvDivision,
  formatCpvCode,
  getCpvCodeName,
  inferCpvDivisionsFromText,
} from "@/lib/cpvCodes";
import type { TaxonomyProvider } from "../types";

/** UK/EU CPV-based taxonomy provider (wraps the existing `lib/cpvCodes` helpers). */
export const cpvEicProvider: TaxonomyProvider = {
  id: "cpv_eic",
  inferDivisionsFromText: inferCpvDivisionsFromText,
  getName: getCpvCodeName,
  formatCode: formatCpvCode,
  division: cpvDivision,
  overlapScore(companyDivisions: string[], tenderCodes: string[] | null): number {
    if (!tenderCodes?.length) return 0.5;
    if (companyDivisions.length === 0) return 0.5;
    const tenderDivisions = new Set(
      tenderCodes.map((c) => cpvDivision(c)).filter((d) => d.length >= 2),
    );
    for (const d of companyDivisions) {
      if (tenderDivisions.has(d)) return 1;
    }
    return 0.15;
  },
};
