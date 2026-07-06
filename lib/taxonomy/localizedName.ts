import { sql, type SQL, type Column } from "drizzle-orm";
import { getActiveProfile } from "@/lib/deployment";

/**
 * The language the reference taxonomies (markets, standards, competencies) are
 * surfaced in — both for UI display and AI analysis. Region-static: resolved once
 * from the active deployment profile (`taxonomyLanguage`).
 *
 * Server-only — do not import from client components.
 */
export function getTaxonomyLanguage(): "en" | "zh-CN" {
  return getActiveProfile().taxonomyLanguage;
}

/**
 * Build a `.select()` expression that yields the locale-appropriate taxonomy name.
 * English deployments read the plain `name` column; Chinese deployments read the
 * `name_zh` column, falling back to English when a translation is blank/missing.
 *
 * The result is meant to be aliased back to `name` at the call site
 * (`.select({ name: localizedName(markets.name, markets.nameZh) })`) so every
 * downstream reader — UI, directory, AI prompts, embeddings — is unchanged.
 */
export function localizedName(nameCol: Column, nameZhCol: Column): SQL<string> {
  return getTaxonomyLanguage() === "zh-CN"
    ? sql<string>`coalesce(nullif(${nameZhCol}, ''), ${nameCol})`
    : sql<string>`${nameCol}`;
}

/**
 * Same as {@link localizedName} for the competency `category` / `category_zh`
 * grouping label. Kept separate so a table without a translated category can opt
 * out simply by not calling it.
 */
export function localizedCategory(
  categoryCol: Column,
  categoryZhCol: Column,
): SQL<string | null> {
  return getTaxonomyLanguage() === "zh-CN"
    ? sql<string | null>`coalesce(nullif(${categoryZhCol}, ''), ${categoryCol})`
    : sql<string | null>`${categoryCol}`;
}
