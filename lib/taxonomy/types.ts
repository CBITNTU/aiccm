/**
 * Procurement classification provider. The UK/EU deployment uses CPV codes; other
 * regions can register their own scheme (or a neutral stub) without changing the
 * matching/embedding code that consumes this interface.
 */
export interface TaxonomyProvider {
  id: string;
  /** Infer classification "divisions" from free text (capabilities, summary). */
  inferDivisionsFromText(text: string): string[];
  /** Human-readable name for a classification code. */
  getName(code: string): string;
  /** Display tuple for a code. */
  formatCode(code: string): { code: string; name: string };
  /** Division (coarse grouping) of a code, e.g. CPV "45211300" → "45". */
  division(code: string): string;
  /** Overlap score in [0,1] between a company's divisions and a tender's codes. */
  overlapScore(companyDivisions: string[], tenderCodes: string[] | null): number;
}
