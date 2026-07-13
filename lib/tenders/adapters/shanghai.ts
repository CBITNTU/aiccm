import type {
  TenderData,
  TenderFetchParams,
  TenderFetchResult,
  TenderSourceAdapter,
} from "../types";

/**
 * Shanghai tender source — scrapes the public Shanghai listing on
 * 招标与采购网 (zbycg.com). This is the first China-specific automated feed:
 * it is wired only into the `cn` deployment profile (see lib/deployment/profiles/cn.ts),
 * so it never runs for UK/EU deployments.
 *
 * The site has no public API. The province listing pages expose title, region,
 * category and date plus a per-notice detail link (`agent_<id>.html`). The detail
 * page additionally carries the project number, budget, buyer and requirement text
 * WITHOUT requiring login, so we enrich each notice from its detail page.
 *
 * Free access is limited to the first 20 listing pages (page 21+ force-redirects to
 * page 1), so we cap pagination accordingly.
 */
const ZBYCG_BASE = "http://www.zbycg.com";
const LISTING_PATH = "/prov-shanghai/";
// Free tier only serves the first 20 pages; beyond that the site redirects to page 1.
const MAX_FREE_PAGES = 20;
// This is a scraped site, so keep detail fetches gentle: low concurrency plus a
// minimum gap between requests (see DETAIL_MIN_GAP_MS).
const DETAIL_CONCURRENCY = 2;
const DETAIL_MIN_GAP_MS = 400;
const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip scripts/styles/tags to a flat text blob for label-based field extraction. */
function toPlainText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

/**
 * Fetch a page with polite retry/backoff. Retries on 429 and 5xx (honouring
 * `Retry-After` when present) and on transient network/timeout errors, using
 * exponential backoff capped at MAX_BACKOFF_MS. 4xx (other than 429) are treated
 * as permanent and not retried.
 */
async function fetchHtml(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; TenderMatchingService/1.0; +https://tndrx.cn)",
        },
        // Bound each request so a hanging upstream can't stall the sync.
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) return response.text();

      const retryable = response.status === 429 || response.status >= 500;
      // Drain the body so the connection can be reused.
      await response.text().catch(() => {});

      if (!retryable || attempt >= MAX_RETRIES) {
        throw new Error(
          `Shanghai (zbycg.com) error: ${response.status} ${response.statusText} for ${url}`,
        );
      }

      const retryAfter = parseRetryAfterMs(response.headers.get("Retry-After"));
      const backoff = Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
      const waitMs = Math.min(retryAfter ?? backoff, MAX_BACKOFF_MS);
      console.warn(
        `[shanghai_zbycg] ${response.status} for ${url}; retry ${attempt}/${MAX_RETRIES} in ${Math.round(waitMs / 1000)}s`,
      );
      await sleep(waitMs);
    } catch (err) {
      lastError = err;
      // Re-throw permanent (non-retryable HTTP) errors immediately.
      if (err instanceof Error && err.message.startsWith("Shanghai (zbycg.com) error:")) {
        throw err;
      }
      if (attempt >= MAX_RETRIES) break;
      const backoff = Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);
      console.warn(
        `[shanghai_zbycg] network error for ${url}; retry ${attempt}/${MAX_RETRIES} in ${Math.round(backoff / 1000)}s:`,
        err instanceof Error ? err.message : err,
      );
      await sleep(backoff);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Shanghai (zbycg.com) fetch failed after ${MAX_RETRIES} attempts: ${url}`);
}

interface ListingItem {
  noticeId: string;
  title: string;
  location: string;
  category: string;
  publicationDate: string; // yyyy-mm-dd
  detailUrl: string;
}

/**
 * Parse the notice list out of a province listing page. Structure per item:
 *   <h3 class="notice-item-first">TITLE</h3>
 *   <div class="notice-address"> ... <span>REGION</span></div>
 *   <div class="notice-gongcheng">CATEGORY</div>
 *   <div class="notice-item-fourth-left"> ... <span>DATE</span></div>
 *   <a href="agent_<id>.html">查看详情</a>
 */
function parseListing(html: string): ListingItem[] {
  // Isolate the notice-list container so hot-project/nav blocks (which also link to
  // agent_*.html) don't get parsed as tenders.
  const listStart = html.indexOf('class="notice-list"');
  const listEnd = html.indexOf('class="fenye-div"', listStart);
  const section =
    listStart === -1
      ? html
      : html.slice(listStart, listEnd === -1 ? undefined : listEnd);

  const itemRe =
    /<h3 class="notice-item-first">([\s\S]*?)<\/h3>[\s\S]*?<div class="notice-address">[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="notice-gongcheng">([\s\S]*?)<\/div>[\s\S]*?<div class="notice-item-fourth-left">[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?href="agent_(\d+)\.html"/g;

  const items: ListingItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(section)) !== null) {
    const [, rawTitle, rawLocation, rawCategory, rawDate, noticeId] = m;
    const title = cleanText(rawTitle);
    if (!title) continue;
    items.push({
      noticeId,
      title,
      location: cleanText(rawLocation) || "上海",
      category: cleanText(rawCategory),
      publicationDate: cleanText(rawDate),
      detailUrl: `${ZBYCG_BASE}/agent_${noticeId}.html`,
    });
  }
  return items;
}

interface DetailFields {
  projectNumber?: string;
  buyer?: string;
  description?: string;
  budget?: number | null;
}

/** Chinese amount unit multipliers. 万 = 10^4, 亿 = 10^8. */
const CN_AMOUNT_MULTIPLIER: Record<string, number> = {
  万: 10_000,
  亿: 100_000_000,
};

/**
 * Extract a budget amount from Chinese notice text. The 万/亿 multiplier can appear
 * either inside the label parentheses (e.g. "预算金额（万元）：15") OR as a suffix on
 * the number itself (e.g. "预算金额：15万元", "预算15万元", "预算1.5亿元"), so we detect
 * it in both positions. Without this, "15万元" was previously parsed as 15 instead of
 * 150,000.
 */
function extractBudget(text: string): number | null {
  // Group 1: optional unit inside the label parentheses, e.g. （万元）.
  // Group 2: the numeric amount.
  // Group 3: optional unit suffix directly after the amount, e.g. 15万元.
  const m = text.match(
    /预算(?:金额)?\s*[（(]?\s*(万|亿)?\s*元?\s*[）)]?\s*[：:]?\s*(?:¥|￥|人民币)?\s*([\d,]+(?:\.\d+)?)\s*(万|亿)?/,
  );
  if (!m) return null;
  const raw = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(raw)) return null;
  const unit = m[1] || m[3];
  const multiplier = unit ? (CN_AMOUNT_MULTIPLIER[unit] ?? 1) : 1;
  return Math.floor(raw * multiplier);
}

function parseDetail(html: string): DetailFields {
  const text = toPlainText(html);
  const projectNumber = text
    .match(/项目编号\s*[：:]\s*([^\s，,。；;]+)/)?.[1]
    ?.trim();
  // Buyer is usually stated as "受<单位> 委托"; fall back to explicit labels.
  const buyer =
    text.match(/受\s*([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,60}?)\s*委托/)?.[1]?.trim() ||
    text
      .match(/(?:采购人|采购单位|招标人|采购方)(?:名称)?\s*[：:]\s*([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,60})/)?.[1]
      ?.trim();
  const description = text
    .match(/采购需求\s*[：:]\s*([^]{0,300}?)(?:合同履约|一、|二、|本项目|$)/)?.[1]
    ?.trim();
  return {
    projectNumber,
    buyer,
    description,
    budget: extractBudget(text),
  };
}

function transformToTender(item: ListingItem, detail: DetailFields): TenderData {
  const description = detail.description || item.title;
  return {
    reference_number: `zbycg-${item.noticeId}`,
    title: item.title,
    buyer: detail.buyer || "未公开采购单位",
    // The site uses Chinese sector labels, not CPV codes.
    cpv_codes: [],
    description,
    budget_min: detail.budget ?? null,
    budget_max: detail.budget ?? null,
    location: item.location || "上海",
    deadline: null,
    status: "open",
    publication_date: item.publicationDate
      ? new Date(item.publicationDate).toISOString()
      : new Date().toISOString(),
    contact_info: {
      organization: detail.buyer || null,
    },
    requirements: {
      sectors: item.category ? [item.category] : [],
      location: item.location || "上海",
      projectNumber: detail.projectNumber ?? null,
    },
    documents: {
      specification_url: item.detailUrl,
      application_url: item.detailUrl,
    },
    source: "shanghai_zbycg",
    currency: "CNY",
    external_id: detail.projectNumber || item.noticeId,
  };
}

/**
 * Enrich listing items with detail-page fields. Best-effort, with bounded concurrency
 * and a global minimum gap between detail requests (DETAIL_MIN_GAP_MS) so concurrent
 * workers don't burst the scraped site.
 */
async function enrichWithDetails(items: ListingItem[]): Promise<TenderData[]> {
  const results: TenderData[] = new Array(items.length);
  let cursor = 0;
  // Shared token so all workers collectively respect a minimum inter-request gap.
  let nextAllowedAt = 0;
  const throttle = async (): Promise<void> => {
    const now = Date.now();
    const wait = Math.max(0, nextAllowedAt - now);
    nextAllowedAt = Math.max(now, nextAllowedAt) + DETAIL_MIN_GAP_MS;
    if (wait > 0) await sleep(wait);
  };
  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index];
        let detail: DetailFields = {};
        try {
          await throttle();
          detail = parseDetail(await fetchHtml(item.detailUrl));
        } catch (e) {
          // Detail enrichment is best-effort — fall back to listing-only data.
          console.warn(
            `[shanghai_zbycg] detail fetch failed for ${item.noticeId}:`,
            e instanceof Error ? e.message : e,
          );
        }
        results[index] = transformToTender(item, detail);
      }
    }),
  );
  return results;
}

export const shanghaiZbycgAdapter: TenderSourceAdapter = {
  id: "shanghai_zbycg",
  label: "Shanghai (zbycg.com)",
  defaultCurrency: "CNY",
  eagerEmbed: false,
  // Be polite to the scraped site; pace listing pages 2s apart.
  syncDelayMs: 2000,
  async fetch(params: TenderFetchParams): Promise<TenderFetchResult> {
    const { isAdmin = false, page = 1, searchTerm } = params;
    const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), MAX_FREE_PAGES);

    const listingUrl =
      safePage <= 1
        ? `${ZBYCG_BASE}${LISTING_PATH}`
        : `${ZBYCG_BASE}${LISTING_PATH}list-${safePage}.html`;

    const items = parseListing(await fetchHtml(listingUrl));

    const filtered = searchTerm
      ? items.filter((i) => i.title.includes(searchTerm))
      : items;

    const tenders = await enrichWithDetails(filtered);

    // Only admins paginate a full sync; anonymous callers get a single page.
    const hasMore = isAdmin && items.length > 0 && safePage < MAX_FREE_PAGES;

    return {
      tenders,
      total: tenders.length,
      hasMore,
      nextPage: hasMore ? safePage + 1 : null,
    };
  },
};
