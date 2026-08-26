import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";
import { validateUrl } from "@/lib/api/validation";
import { safeFetch } from "@/lib/services/companyEnrichmentService";
import { getBlobStore, companyLogoKey } from "@/lib/storage";
import {
  sniffImageKind,
  readImageDimensions,
  IMAGE_MIME,
  IMAGE_EXT,
} from "@/lib/images/sniff";

const LOG = "[CompanyLogo]";

// ---------------------------------------------------------------------------
// Shared limits
// ---------------------------------------------------------------------------

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** A manifest is a small JSON document; anything larger is not one. */
const MAX_MANIFEST_BYTES = 128 * 1024;
/** Higher than the upload floor: this is what rejects 16/32px favicons. */
const MIN_LOGO_PX = 64;
const MAX_LOGO_PX = 4096;
const MAX_CANDIDATES_TRIED = 8;
const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// Candidate extraction
// ---------------------------------------------------------------------------

export type LogoOrigin =
  | "header-img"
  | "apple-touch-icon"
  | "manifest-icon"
  | "link-icon"
  | "og-image"
  | "favicon-ico";

export interface LogoCandidate {
  url: string;
  score: number;
  origin: LogoOrigin;
}

/** Formats we will not even spend a request on — see lib/images/sniff.ts. */
const SKIP_EXT_RE = /\.(svg|svgz|bmp|tiff?)(\?|#|$)/i;

/**
 * `.ico` is no longer in SKIP_EXT_RE: the byte sniff is the authority, and a
 * fair number of sites serve a PNG under an `.ico` href. It is scored down to
 * just above the blind probe instead, so trying it costs at most one request
 * on the path where everything better has already failed.
 */
const ICO_EXT_RE = /\.ico(\?|#|$)/i;

/** Attribute text marking an <img> as the site's mark rather than content. */
const LOGO_HINT_RE = /\b(logo|brand|wordmark|site-?title|site-?icon)\b/i;

/**
 * Attribute text marking an <img> as somebody ELSE's mark.
 *
 * "Trusted by" strips are the single richest source of wrong logos, because
 * every image in one is a real, well-formed logo — just not this company's.
 */
const LOGO_ANTI_HINT_RE =
  /\b(client|customer|partner|sponsor|award|press|testimonial|trusted[-_ ]?by|carousel|marquee|slider|swiper)\b/i;

/** How far into <body> to look for the masthead image. */
const HEADER_SCAN_CHARS = 15000;

/** How far back from an <img> to look for the anchor wrapping it. */
const HOME_LINK_LOOKBEHIND = 300;

/**
 * Undo the character references an attribute value is required to carry.
 *
 * `&` is the one that matters: a CDN URL is written `?w=180&amp;h=180` in the
 * markup, and handing that to fetch verbatim asks the origin for a parameter
 * called `amp;h`. Contentful — and so stripe.com's apple-touch-icon — answers
 * that with a 400. The rest are here because an attribute may legally contain
 * them, not because they show up in URLs.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&(?:#38|#x26|amp);/gi, "&")
    .replace(/&(?:#60|#x3c|lt);/gi, "<")
    .replace(/&(?:#62|#x3e|gt);/gi, ">")
    .replace(/&(?:#34|#x22|quot);/gi, '"')
    .replace(/&(?:#39|#x27|apos);/gi, "'");
}

/**
 * Read one attribute off a tag.
 *
 * The lookbehind matters: a bare `\b` lets `src` match inside `data-src`, and
 * `name` match inside `data-name`. Lazy-loaded markup is full of both, and
 * silently reading the wrong attribute is worse than reading none — so the
 * `data-*` variants we do want are asked for by their full name instead.
 */
function attrOf(tag: string, name: string): string | null {
  const match = new RegExp(`(?<![-\\w])${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  return match ? decodeEntities(match[1].trim()) : null;
}

/** `sizes="180x180 32x32"` -> 180. `sizes="any"` -> 0. */
function largestSize(sizes: string | null): number {
  if (!sizes) return 0;
  let best = 0;
  for (const match of sizes.matchAll(/(\d+)\s*[xX]\s*(\d+)/g)) {
    best = Math.max(best, Number(match[1]), Number(match[2]));
  }
  return best;
}

function sizeBonus(px: number): number {
  if (px >= 180) return 25;
  if (px >= 96) return 15;
  if (px >= 48) return 5;
  return 0;
}

/**
 * Pick the highest-resolution entry out of a `srcset`.
 *
 * Responsive markup routinely leaves a placeholder or the smallest variant in
 * `src` and puts the real asset here. Prefer the largest `w`, then the largest
 * `x`, then the last entry — the conventional ordering when neither descriptor
 * is present.
 *
 * Splitting on "," misparses a URL that itself contains a comma. That is rare
 * outside data: URIs (which `add` rejects anyway), and the alternative is a
 * real tokenizer for a candidate we score below the plain `src`.
 */
function largestSrcsetUrl(srcset: string | null): string | null {
  if (!srcset) return null;
  let bestW: { url: string; n: number } | null = null;
  let bestX: { url: string; n: number } | null = null;
  let last: string | null = null;

  for (const part of srcset.split(",")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const url = tokens[0];
    if (!url) continue;
    last = url;

    const descriptor = tokens[1] ?? "";
    const w = /^(\d+(?:\.\d+)?)w$/i.exec(descriptor);
    const x = /^(\d+(?:\.\d+)?)x$/i.exec(descriptor);
    if (w) {
      const n = Number(w[1]);
      if (!bestW || n > bestW.n) bestW = { url, n };
    } else if (x) {
      const n = Number(x[1]);
      if (!bestX || n > bestX.n) bestX = { url, n };
    }
  }

  return bestW?.url ?? bestX?.url ?? last;
}

/**
 * Is this <img> wrapped in a link back to the site root?
 *
 * The strongest structural cue there is: a masthead mark is almost always the
 * home link, and a third-party logo in a customer carousel almost never is.
 * `before` is the text immediately preceding the tag.
 */
function insideHomeLink(before: string, base: URL): boolean {
  const anchors = Array.from(before.matchAll(/<a\b[^>]*>/gi));
  const open = anchors[anchors.length - 1];
  if (!open) return false;
  // A </a> after the last <a> means the image is no longer inside it.
  if (/<\/a>/i.test(before.slice(open.index + open[0].length))) return false;

  const href = attrOf(open[0], "href");
  if (!href) return false;
  try {
    const abs = new URL(href, base);
    return abs.origin === base.origin && (abs.pathname === "/" || abs.pathname === "");
  } catch {
    return false;
  }
}

/**
 * Rank logo candidates from a homepage.
 *
 * Operates on the RAW response text. Do not pass this `tidyHtml` output — that
 * strips <svg>/<script>/<style> and truncates to 15KB, which destroys the
 * <head> link tags on any page with an inline critical-CSS block.
 *
 * Pure and side-effect free so it can be unit-tested without a network. Web-app
 * manifest icons need a second request and so are merged in by the caller; see
 * `extractManifestUrl` / `manifestIconCandidates`.
 */
export function extractLogoCandidates(html: string, baseUrl: string): LogoCandidate[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const byUrl = new Map<string, LogoCandidate>();
  const add = (
    raw: string | null,
    score: number,
    origin: LogoOrigin,
    { skipExtFilter = false }: { skipExtFilter?: boolean } = {},
  ) => {
    if (!raw) return;
    const href = raw.trim();
    // data: URIs would need a second decode path for marginal gain.
    if (!href || href.startsWith("data:")) return;
    if (!skipExtFilter && SKIP_EXT_RE.test(href)) return;

    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") return;
    abs.hash = "";

    const key = abs.toString();
    const existing = byUrl.get(key);
    // The same asset commonly appears as both a header <img> and og:image.
    // Keep the strongest signal so ranking reflects the best evidence.
    if (!existing || score > existing.score) {
      byUrl.set(key, { url: key, score, origin });
    }
  };

  // 1. <link rel="apple-touch-icon" | "icon" | "shortcut icon">
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = (attrOf(tag, "rel") ?? "").toLowerCase();
    const href = attrOf(tag, "href");
    const px = largestSize(attrOf(tag, "sizes"));

    // No skip on a small declared `sizes` here, tempting as it is: link-tag
    // size declarations are famously stale (a `sizes="57x57"` apple-touch-icon
    // routinely serves a 180px file), the score gradient already sinks small
    // icons below everything better, and MAX_CANDIDATES_TRIED leaves room to
    // let the byte check be the authority. The manifest path, whose sizes are
    // spec-authoritative and whose lists run long, does skip them.
    if (rel.includes("apple-touch-icon")) {
      // 70..95 depending on size, so a >=180px one (95) outranks even a
      // masthead <img> (90) while a small one does not. Deliberate: we render
      // into a square avatar, and a purpose-built square app icon stays legible
      // at 32px where a wide wordmark letterboxes down to an unreadable strip.
      // Below 180px the wordmark is the better bet, and the gradient says so.
      const score = 70 + sizeBonus(px || 180);
      add(href, score, "apple-touch-icon");
      add(largestSrcsetUrl(attrOf(tag, "imagesrcset")), score - 1, "apple-touch-icon");
    } else if (/\b(shortcut\s+)?icon\b/.test(rel)) {
      // A declared .ico is usually a genuine 16/32px ICO, which the sniff
      // rejects — worth a request only once everything else has failed.
      add(href, href && ICO_EXT_RE.test(href) ? 15 : 50 + sizeBonus(px), "link-icon");
    }
  }

  // 2. <meta property="og:image"> / twitter:image
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attrOf(tag, "property") ?? attrOf(tag, "name") ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:url" || key === "twitter:image") {
      // Deliberately low: og:image is a social share card as often as a mark.
      // `isUsableLogoShape` rejects the card-shaped ones once we know the
      // pixel dimensions, which is the only point at which they are knowable.
      add(attrOf(tag, "content"), 35, "og-image");
    }
  }

  // 3. <img> near the top of <body> whose attributes name it as the logo.
  //    Regex cannot reliably delimit a nested <header>, so scan a fixed window
  //    and require an explicit hint — the same pragmatic trade-off that
  //    extractInternalLinks makes with its href regex.
  const bodyAt = html.search(/<body\b/i);
  const from = bodyAt >= 0 ? bodyAt : 0;
  const window = html.slice(from, from + HEADER_SCAN_CHARS);
  let structuralSeen = false;
  for (const match of window.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];

    if (LOGO_ANTI_HINT_RE.test(tag)) continue;

    // Where the hint appears decides how much it is worth. `class="site-logo"`
    // is structure — authored once, in the site's own template, by the site's
    // own developer. `alt="Adyen logo"` is content, authored per row in a CMS,
    // and on a customer strip it names somebody else entirely; trusting it is
    // how you end up storing a competitor's mark as this company's.
    const structural =
      LOGO_HINT_RE.test(attrOf(tag, "class") ?? "") ||
      LOGO_HINT_RE.test(attrOf(tag, "id") ?? "");
    if (!structural && !LOGO_HINT_RE.test(tag)) continue;

    const before = window.slice(Math.max(0, match.index - HOME_LINK_LOOKBEHIND), match.index);
    const homeLink = insideHomeLink(before, base);

    // A hint that lives only in `alt`, `title` or the file name is not evidence
    // of OWNERSHIP — `alt="Adyen logo"` and `adyen-logo-white.svg` are both
    // perfectly accurate, and both describe somebody else's mark. Text like
    // that qualifies an image; it does not nominate it. So an image with no
    // structural hint has to be corroborated by the one cue a carousel entry
    // never has: being the link back to the site root.
    if (!structural && !homeLink) continue;

    // Full confidence goes to the FIRST structurally-hinted image only. The
    // masthead mark is essentially always the first logo-classed <img> in the
    // document, and this is what keeps a later `class="logo-carousel__item"`
    // from tying with it.
    const strong = structural && !structuralSeen;
    if (structural) structuralSeen = true;

    // 90: an <img class="logo"> in the masthead is the actual wordmark at
    // display resolution, which is exactly what we want to show. 45 for
    // everything weaker — deliberately below `rel=icon` (50), so a hint we do
    // not fully trust can never outrank an icon the site declared outright.
    let score = strong ? 90 : 45;
    if (homeLink) score += 10;

    add(attrOf(tag, "src"), score, "header-img");
    // Responsive and lazy-loaded markup routinely parks a placeholder in `src`.
    // These are additional candidates, not replacements — `add` keeps the max.
    add(attrOf(tag, "data-src"), score - 1, "header-img");
    add(largestSrcsetUrl(attrOf(tag, "srcset")), score - 1, "header-img");
    add(largestSrcsetUrl(attrOf(tag, "data-srcset")), score - 1, "header-img");
  }

  // 4. /favicon.ico as last resort, exempt from SKIP_EXT_RE.
  //    The bare /favicon.ico path is a blind probe, and a good number of sites
  //    serve a PNG under it. The byte sniff downstream rejects a genuine ICO,
  //    so the only cost of trying is one request on the rare path where every
  //    better candidate has already failed.
  try {
    add(new URL("/favicon.ico", base).toString(), 10, "favicon-ico", {
      skipExtFilter: true,
    });
  } catch {
    // Unreachable given `base` parsed, but the extractor must never throw.
  }

  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
}

/**
 * Absolute URL of the web-app manifest, if the page declares one.
 *
 * Its `icons[]` are purpose-built, correctly sized and almost always PNG —
 * the best raster source a site can offer us — but reading them costs a second
 * request, so extraction and fetching are split.
 */
export function extractManifestUrl(html: string, baseUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bmanifest\b/i.test(attrOf(tag, "rel") ?? "")) continue;
    const href = attrOf(tag, "href");
    if (!href || href.startsWith("data:")) continue;
    try {
      const abs = new URL(href, base);
      if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;
      abs.hash = "";
      return abs.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Turn a parsed manifest into candidates.
 *
 * Icon `src` resolves against the MANIFEST's URL, not the page's — that is what
 * the spec says, and manifests are commonly served from a subdirectory.
 *
 * Scored 60..85: stronger evidence than a bare `rel=icon` (50), because the
 * manifest declares size and purpose outright, but below a >=180px
 * apple-touch-icon (95) and below a structural masthead img (90), which are the
 * same asset class under older and better-curated conventions.
 *
 * `purpose: "monochrome"` icons are solid-fill mask assets and render as a
 * black blob, so they are dropped. `maskable` ones carry a large safe-zone
 * margin and look shrunken in a square tile, so they lose a tie rather than
 * being dropped.
 */
export function manifestIconCandidates(
  json: unknown,
  manifestUrl: string,
): LogoCandidate[] {
  let base: URL;
  try {
    base = new URL(manifestUrl);
  } catch {
    return [];
  }

  const icons = (json as { icons?: unknown })?.icons;
  if (!Array.isArray(icons)) return [];

  const byUrl = new Map<string, LogoCandidate>();
  for (const raw of icons) {
    const icon = raw as { src?: unknown; sizes?: unknown; purpose?: unknown };
    if (typeof icon?.src !== "string") continue;
    const src = icon.src.trim();
    if (!src || src.startsWith("data:") || SKIP_EXT_RE.test(src)) continue;

    const px = largestSize(typeof icon.sizes === "string" ? icon.sizes : null);
    // Unlike a <link> tag, a manifest's `sizes` is authoritative and the list
    // routinely runs to half a dozen entries, so dropping the ones that cannot
    // clear the floor is worth it.
    if (px > 0 && px < MIN_LOGO_PX) continue;

    let abs: URL;
    try {
      abs = new URL(src, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;
    abs.hash = "";

    const purpose = typeof icon.purpose === "string" ? icon.purpose.toLowerCase() : "";
    if (/\bmonochrome\b/.test(purpose) && !/\bany\b/.test(purpose)) continue;
    const maskableOnly = /\bmaskable\b/.test(purpose) && !/\bany\b/.test(purpose);
    const score = 60 + sizeBonus(px) - (maskableOnly ? 5 : 0);

    const key = abs.toString();
    const existing = byUrl.get(key);
    if (!existing || score > existing.score) {
      byUrl.set(key, { url: key, score, origin: "manifest-icon" });
    }
  }

  return Array.from(byUrl.values());
}

/** Merge candidate lists, keeping the strongest signal per URL, best first. */
export function mergeCandidates(...lists: LogoCandidate[][]): LogoCandidate[] {
  const byUrl = new Map<string, LogoCandidate>();
  for (const list of lists) {
    for (const candidate of list) {
      const existing = byUrl.get(candidate.url);
      if (!existing || candidate.score > existing.score) {
        byUrl.set(candidate.url, candidate);
      }
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

/**
 * Open Graph share cards are ~1.91:1 and large. A logo used as og:image is
 * square-ish, or a wordmark much wider than 2:1, or simply small.
 */
const OG_CARD_RATIO_MIN = 1.7;
const OG_CARD_RATIO_MAX = 2.1;
/** Above this ratio an og:image is only believable if it is also small. */
const OG_MARK_MAX_RATIO = 1.6;
const OG_MARK_MAX_PX = 640;
/** Nothing shaped like a banner strip survives being cropped into an avatar. */
const MAX_LOGO_ASPECT = 8;

/**
 * Would an image of this shape, from this source, pass as a logo?
 *
 * The dimensions are only knowable after the bytes are fetched, so this runs in
 * the download loop rather than at extraction time — most pages do not declare
 * `og:image:width`, and the ones that do are not trustworthy about it.
 *
 * The card rule is scoped to `og-image` on purpose. Everything in the 65..95
 * tier — apple-touch-icon, manifest icons, a `class="logo"` masthead — was
 * pointed at us by the site author as its mark, and second-guessing its shape
 * costs us more good logos than it saves us bad ones.
 */
export function isUsableLogoShape(
  origin: LogoOrigin,
  width: number,
  height: number,
): boolean {
  if (!(width > 0) || !(height > 0)) return false;

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > MAX_LOGO_ASPECT) return false;

  if (origin !== "og-image") return true;

  // The whole social-card family sits at essentially one ratio: Open Graph
  // recommends 1200x630 (1.905), Twitter's summary_large_image is 2:1, and
  // Facebook's stated minimum 600x315 is 1.905 again. Yapily's is 1.90. Almost
  // no brand mark lives in that band — squares dominate, and wordmarks jump
  // straight past 3:1 — so the cut is narrow and size-independent, which is
  // what catches a small 600x315 card.
  if (ratio >= OG_CARD_RATIO_MIN && ratio <= OG_CARD_RATIO_MAX) return false;

  // Catch-all for hero banners outside that band (2400x400 and friends). The
  // size escape hatch preserves the case this must not break: a small B2B site
  // whose og:image genuinely is its logo file, which is a 400-600px asset. A
  // share card is never that small.
  if (ratio > OG_MARK_MAX_RATIO && Math.max(width, height) > OG_MARK_MAX_PX) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export type LogoDiscoveryFailure =
  | "no_website"
  | "blob_unconfigured"
  | "manual_logo_exists"
  | "fetch_failed"
  | "no_candidates"
  | "no_valid_image";

export interface LogoDiscoveryResult {
  ok: boolean;
  logoUrl?: string;
  reason?: LogoDiscoveryFailure;
  /** Diagnostics, mirroring CrawlResult.errors. Never surfaced to end users. */
  errors: string[];
}

/**
 * Fetch a URL, re-validating every redirect hop.
 *
 * `safeFetch` defaults to `redirect: "follow"`, which would let a public host
 * 302 straight to an internal one and walk around the SSRF gate. Following
 * manually is the only way to run validateUrl on each Location.
 */
async function fetchGuarded(
  url: string,
  errors: string[],
  maxBytes: number,
): Promise<Uint8Array | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      validateUrl(current);
    } catch (error) {
      errors.push(`blocked ${current}: ${error instanceof Error ? error.message : error}`);
      return null;
    }

    const response = await safeFetch(current, { redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current).toString();
      } catch {
        return null;
      }
      continue;
    }

    if (!response.ok) {
      errors.push(`${current}: HTTP ${response.status}`);
      return null;
    }

    // Content-Length is advisory and chunked responses omit it, so this is a
    // cheap early-out, not the actual bound.
    const declared = Number(response.headers.get("content-length"));
    if (declared && declared > maxBytes) {
      errors.push(`${current}: declared ${declared} bytes, over cap`);
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      errors.push(`${current}: ${bytes.byteLength} bytes, over cap`);
      return null;
    }
    return bytes;
  }

  errors.push(`${url}: too many redirects`);
  return null;
}

/** Manifest icons, or [] on any failure. Never throws — diagnostics go to `errors`. */
async function fetchManifestCandidates(
  manifestUrl: string,
  errors: string[],
): Promise<LogoCandidate[]> {
  try {
    const bytes = await fetchGuarded(manifestUrl, errors, MAX_MANIFEST_BYTES);
    if (!bytes) return [];
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return manifestIconCandidates(json, manifestUrl);
  } catch (error) {
    errors.push(`${manifestUrl}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

/**
 * Find a logo on the company's website and mirror it into our own store.
 *
 * Never throws — mirrors `crawlWebsite`'s contract. Callers are a queue worker
 * and a user-facing route; neither should 500 because someone's homepage is
 * broken.
 *
 * We mirror the bytes rather than hotlink: a hotlink breaks on their next
 * redesign, leaks our users' IPs to their servers, and gives us no cache
 * control or `next/image` optimization.
 */
export async function discoverCompanyLogo(
  companyId: string,
  opts: { force?: boolean } = {},
): Promise<LogoDiscoveryResult> {
  const { force = false } = opts;
  const errors: string[] = [];

  /**
   * Stamp the attempt on every terminal outcome, success or failure. Without
   * this a company whose site has no usable logo is re-crawled by every bulk
   * regeneration, forever.
   */
  const finish = async (result: LogoDiscoveryResult): Promise<LogoDiscoveryResult> => {
    try {
      await db
        .update(companies)
        .set({ logoDiscoveryAttemptedAt: new Date() })
        .where(eq(companies.id, companyId));
    } catch (error) {
      console.error(`${LOG} failed to stamp attempt for ${companyId}:`, error);
    }
    return result;
  };

  try {
    const company = await db
      .select({
        websiteUrl: companies.websiteUrl,
        logoUrl: companies.logoUrl,
        logoSource: companies.logoSource,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return { ok: false, reason: "no_website", errors: ["company not found"] };
    }

    // A human chose this. Automatic discovery does not get to argue.
    if (!force && company.logoUrl && company.logoSource === "upload") {
      return { ok: false, reason: "manual_logo_exists", errors };
    }

    if (!company.websiteUrl) {
      return await finish({ ok: false, reason: "no_website", errors });
    }

    const store = getBlobStore();
    if (!store.isConfigured) {
      // Deliberately not stamped: this is our misconfiguration, not the site's
      // fault, and stamping would permanently exclude them from the backfill.
      return { ok: false, reason: "blob_unconfigured", errors };
    }

    let homepage: string;
    try {
      validateUrl(company.websiteUrl);
      const response = await safeFetch(company.websiteUrl);
      if (!response.ok) {
        return await finish({
          ok: false,
          reason: "fetch_failed",
          errors: [`homepage: HTTP ${response.status}`],
        });
      }
      homepage = await response.text();
    } catch (error) {
      return await finish({
        ok: false,
        reason: "fetch_failed",
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }

    const pageCandidates = extractLogoCandidates(homepage, company.websiteUrl);

    // Only worth the extra round-trip when the page has not already handed us a
    // purpose-built icon that would outrank anything the manifest can offer.
    const manifestUrl = extractManifestUrl(homepage, company.websiteUrl);
    const manifest =
      manifestUrl && (pageCandidates[0]?.score ?? 0) < 95
        ? await fetchManifestCandidates(manifestUrl, errors)
        : [];

    const candidates = mergeCandidates(pageCandidates, manifest);
    if (candidates.length === 0) {
      return await finish({ ok: false, reason: "no_candidates", errors });
    }

    for (const candidate of candidates.slice(0, MAX_CANDIDATES_TRIED)) {
      let bytes: Uint8Array | null;
      try {
        bytes = await fetchGuarded(candidate.url, errors, MAX_LOGO_BYTES);
      } catch (error) {
        errors.push(`${candidate.url}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      if (!bytes) continue;

      const kind = sniffImageKind(bytes);
      if (!kind) {
        errors.push(`${candidate.url}: unrecognised image format`);
        continue;
      }

      const dimensions = readImageDimensions(bytes, kind);
      if (
        !dimensions ||
        dimensions.width < MIN_LOGO_PX ||
        dimensions.height < MIN_LOGO_PX ||
        dimensions.width > MAX_LOGO_PX ||
        dimensions.height > MAX_LOGO_PX
      ) {
        errors.push(`${candidate.url}: unusable dimensions`);
        continue;
      }

      if (!isUsableLogoShape(candidate.origin, dimensions.width, dimensions.height)) {
        errors.push(
          `${candidate.url}: ${dimensions.width}x${dimensions.height} is not logo-shaped`,
        );
        continue;
      }

      const key = companyLogoKey(companyId, bytes, IMAGE_EXT[kind]);
      const stored = await store.put(key, bytes, IMAGE_MIME[kind]);
      const now = new Date();

      await db
        .update(companies)
        .set({
          logoUrl: stored.url,
          logoSource: "website",
          logoUpdatedAt: now,
          logoDiscoveryAttemptedAt: now,
          updatedAt: now,
        })
        .where(eq(companies.id, companyId));

      if (company.logoUrl && company.logoUrl !== stored.url) {
        await store.delete(company.logoUrl);
      }

      console.log(
        `${LOG} ${companyId}: found via ${candidate.origin} (${dimensions.width}x${dimensions.height})`,
      );
      return { ok: true, logoUrl: stored.url, errors };
    }

    return await finish({ ok: false, reason: "no_valid_image", errors });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    console.error(`${LOG} ${companyId}: unexpected failure`, error);
    return await finish({ ok: false, reason: "fetch_failed", errors });
  }
}
