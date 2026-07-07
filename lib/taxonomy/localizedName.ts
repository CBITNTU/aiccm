import { sql, type SQL, type Column } from "drizzle-orm";
import { getActiveProfile } from "@/lib/deployment";
import { companyCapabilitiesRef } from "@/lib/db/schema/app";

type CapabilityInsert = typeof companyCapabilitiesRef.$inferInsert;

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

/**
 * The write-side counterpart of {@link localizedName}: map an incoming capability
 * editor payload (`{ name, category, parentId }`) onto the correct DB columns for
 * the active deployment.
 *
 * - English deployments write the plain `name` / `category` columns (unchanged).
 * - Chinese deployments write `name_zh` / `category_zh`, leaving the English
 *   source columns untouched — so the admin edits the translation, not the
 *   canonical English. On create the `name` column is `NOT NULL`, so we seed both
 *   `name` and `name_zh` (and `category` + `category_zh`) with the provided value,
 *   giving an English fallback for the brand-new, untranslated row.
 *
 * Only keys present in `body` are emitted, so this works for both full creates and
 * partial updates. Server-only — do not import from client components.
 */
type CapabilityWriteBody = {
  name?: string;
  category?: string | null;
  parentId?: string | null;
};

export function localizeCapabilityWrite(
  body: CapabilityWriteBody,
  opts: { create: true },
): CapabilityInsert;
export function localizeCapabilityWrite(
  body: CapabilityWriteBody,
  opts: { create: false },
): Partial<CapabilityInsert>;
export function localizeCapabilityWrite(
  body: CapabilityWriteBody,
  { create }: { create: boolean },
): CapabilityInsert | Partial<CapabilityInsert> {
  const values: Partial<CapabilityInsert> = {};

  if ("parentId" in body) values.parentId = body.parentId;

  const zh = getTaxonomyLanguage() === "zh-CN";

  if ("name" in body) {
    if (zh) {
      values.nameZh = body.name;
      if (create) values.name = body.name; // satisfy NOT NULL + English fallback
    } else {
      values.name = body.name;
    }
  }

  if ("category" in body) {
    if (zh) {
      values.categoryZh = body.category;
      if (create) values.category = body.category;
    } else {
      values.category = body.category;
    }
  }

  return values as CapabilityInsert;
}
