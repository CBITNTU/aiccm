import { describe, it, expect } from "vitest";
import {
  extractLogoCandidates,
  extractManifestUrl,
  manifestIconCandidates,
  isUsableLogoShape,
} from "@/lib/services/companyLogoService";

const BASE = "https://example.com";

function originOf(candidates: ReturnType<typeof extractLogoCandidates>, url: string) {
  return candidates.find((c) => c.url === url)?.origin;
}

describe("extractLogoCandidates", () => {
  it("prefers a large apple-touch-icon over the masthead img, then link icon, og:image, favicon", () => {
    // We render into a square avatar, so a >=180px purpose-built app icon beats
    // a wide wordmark that would letterbox to an unreadable strip at 32px.
    const html = `
      <html><head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
        <link rel="icon" sizes="32x32" href="/icon.png">
        <meta property="og:image" content="/og.png">
      </head><body>
        <header><img class="site-logo" src="/logo.png" alt="Acme"></header>
      </body></html>`;

    const origins = extractLogoCandidates(html, BASE).map((c) => c.origin);
    expect(origins).toEqual([
      "apple-touch-icon",
      "header-img",
      "link-icon",
      "og-image",
      "favicon-ico",
    ]);
  });

  it("falls back to the masthead img when the apple-touch-icon is small", () => {
    const html = `
      <html><head><link rel="apple-touch-icon" sizes="57x57" href="/apple.png"></head>
      <body><header><img class="logo" src="/logo.png"></header></body></html>`;

    const origins = extractLogoCandidates(html, BASE).map((c) => c.origin);
    expect(origins.slice(0, 2)).toEqual(["header-img", "apple-touch-icon"]);
  });

  it("parses the largest dimension out of sizes and scores it higher", () => {
    const big = extractLogoCandidates(
      '<link rel="icon" sizes="180x180 32x32" href="/a.png">',
      BASE,
    ).find((c) => c.origin === "link-icon")!;
    const small = extractLogoCandidates(
      '<link rel="icon" sizes="16x16" href="/a.png">',
      BASE,
    ).find((c) => c.origin === "link-icon")!;
    const any = extractLogoCandidates(
      '<link rel="icon" sizes="any" href="/a.png">',
      BASE,
    ).find((c) => c.origin === "link-icon")!;

    expect(big.score).toBeGreaterThan(small.score);
    expect(small.score).toBe(any.score); // sizes="any" earns no bonus
  });

  it("resolves relative, root-relative, protocol-relative and absolute hrefs", () => {
    const html = `
      <body>
        <img class="logo" src="img/a.png">
        <img class="logo" src="/b.png">
        <img class="logo" src="//cdn.example.org/c.png">
        <img class="logo" src="https://other.example/d.png">
      </body>`;
    const urls = extractLogoCandidates(html, "https://example.com/about").map((c) => c.url);

    expect(urls).toContain("https://example.com/img/a.png");
    expect(urls).toContain("https://example.com/b.png");
    expect(urls).toContain("https://cdn.example.org/c.png");
    expect(urls).toContain("https://other.example/d.png");
  });

  it("drops formats we cannot use and non-http schemes", () => {
    const html = `
      <head>
        <link rel="icon" href="/favicon.svg">
        <meta property="og:image" content="data:image/png;base64,AAAA">
      </head>
      <body><img class="logo" src="javascript:alert(1)"></body>`;

    const urls = extractLogoCandidates(html, BASE).map((c) => c.url);
    expect(urls.some((u) => u.endsWith(".svg"))).toBe(false);
    expect(urls.some((u) => u.startsWith("data:"))).toBe(false);
    expect(urls.some((u) => u.startsWith("javascript:"))).toBe(false);
  });

  it("keeps a declared .ico but scores it barely above the blind probe", () => {
    // Not dropped pre-fetch any more: plenty of sites serve a PNG under an
    // .ico href, and sniffImageKind is the authority on what the bytes are.
    const candidates = extractLogoCandidates(
      '<head><link rel="icon" type="image/x-icon" href="/favicon.ico?v=1"></head>',
      BASE,
    );
    const declared = candidates.find((c) => c.url.endsWith("favicon.ico?v=1"))!;
    const probe = candidates.find((c) => c.origin === "favicon-ico")!;

    expect(declared.origin).toBe("link-icon");
    expect(declared.score).toBeGreaterThan(probe.score);
    // Far below a normal rel=icon (50): a declared .ico is usually a real ICO.
    expect(declared.score).toBeLessThan(50);
  });

  it("dedupes the same asset to a single candidate at its highest score", () => {
    // Very common: the masthead img and og:image point at the same file.
    const html = `
      <head><meta property="og:image" content="https://example.com/logo.png"></head>
      <body><img class="logo" src="https://example.com/logo.png"></body>`;

    const candidates = extractLogoCandidates(html, BASE);
    const matches = candidates.filter((c) => c.url === "https://example.com/logo.png");
    expect(matches).toHaveLength(1);
    // Kept as the stronger signal, not the last one seen.
    expect(matches[0].origin).toBe("header-img");
  });

  it("requires an explicit logo hint before treating an img as the mark", () => {
    const html = '<body><img src="/hero-photo.jpg"><img id="brand" src="/mark.png"></body>';
    const urls = extractLogoCandidates(html, BASE).map((c) => c.url);
    expect(urls).toContain("https://example.com/mark.png");
    expect(urls).not.toContain("https://example.com/hero-photo.jpg");
  });

  it("recognises shortcut icon and twitter:image", () => {
    const html = `
      <head>
        <link rel="shortcut icon" href="/short.png">
        <meta name="twitter:image" content="/tw.png">
      </head>`;
    const candidates = extractLogoCandidates(html, BASE);
    expect(originOf(candidates, "https://example.com/short.png")).toBe("link-icon");
    expect(originOf(candidates, "https://example.com/tw.png")).toBe("og-image");
  });

  it("always offers /favicon.ico as the lowest-scored last resort", () => {
    const candidates = extractLogoCandidates("<html></html>", BASE);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: "https://example.com/favicon.ico",
      origin: "favicon-ico",
    });
  });

  it("strips fragments so #anchor variants are not separate candidates", () => {
    const html = `
      <body><img class="logo" src="/logo.png#top"><img class="logo" src="/logo.png"></body>`;
    const urls = extractLogoCandidates(html, BASE).map((c) => c.url);
    expect(urls.filter((u) => u.includes("logo.png"))).toEqual([
      "https://example.com/logo.png",
    ]);
  });

  it("returns [] for a non-URL base and never throws on malformed HTML", () => {
    expect(extractLogoCandidates("<html>", "not a url")).toEqual([]);
    expect(() => extractLogoCandidates("<img <<< src=", BASE)).not.toThrow();
    expect(() => extractLogoCandidates("", BASE)).not.toThrow();
  });

  it("decodes the character references an attribute value has to carry", () => {
    // stripe.com writes its apple-touch-icon as `favicon.png?w=180&amp;h=180`.
    // Fetching that verbatim asks the CDN for a parameter named `amp;h`, which
    // Contentful answers with a 400 — so the best candidate on the page dies
    // and discovery falls through to the 2048x1024 share card.
    const urls = extractLogoCandidates(
      '<head><link rel="apple-touch-icon" sizes="180x180" href="/favicon.png?w=180&amp;h=180"></head>',
      BASE,
    ).map((c) => c.url);

    expect(urls).toContain("https://example.com/favicon.png?w=180&h=180");
  });

  it("does not read a data-* attribute as its bare counterpart", () => {
    // `\bsrc` matches inside `data-src`; the lookbehind in attrOf is what stops
    // a lazy-loading placeholder attribute being mistaken for the real one.
    const urls = extractLogoCandidates(
      '<body><img class="logo" data-src="/lazy.png"></body>',
      BASE,
    ).map((c) => c.url);

    expect(urls).toContain("https://example.com/lazy.png");
  });

  it("picks the highest-resolution entry out of srcset and data-srcset", () => {
    const bySrcset = extractLogoCandidates(
      '<body><img class="logo" srcset="/a-320.png 320w, /a-1024.png 1024w, /a-640.png 640w"></body>',
      BASE,
    ).map((c) => c.url);
    expect(bySrcset).toContain("https://example.com/a-1024.png");
    expect(bySrcset).not.toContain("https://example.com/a-320.png");

    const byDensity = extractLogoCandidates(
      '<body><img class="logo" data-srcset="/b@1x.png 1x, /b@2x.png 2x"></body>',
      BASE,
    ).map((c) => c.url);
    expect(byDensity).toContain("https://example.com/b@2x.png");
  });

  it("ranks the explicit src above the srcset entry for the same tag", () => {
    const candidates = extractLogoCandidates(
      '<body><img class="logo" src="/main.png" srcset="/wide.png 1024w"></body>',
      BASE,
    );
    const main = candidates.find((c) => c.url.endsWith("main.png"))!;
    const wide = candidates.find((c) => c.url.endsWith("wide.png"))!;
    expect(main.score).toBeGreaterThan(wide.score);
  });
});

describe("extractLogoCandidates — third-party marks", () => {
  it("ignores a customer strip even when every image is captioned a logo", () => {
    // Every image in a "trusted by" carousel is a real, well-formed logo. Just
    // not this company's — which is the whole failure mode.
    const html = `
      <body>
        <div class="clients">
          <img class="clients__logo" alt="Adyen logo" src="/adyen.png">
          <img class="image-component__img" alt="Revolut logo" src="/revolut.png">
        </div>
      </body>`;
    const urls = extractLogoCandidates(html, BASE).map((c) => c.url);

    expect(urls.some((u) => u.includes("adyen"))).toBe(false);
    expect(urls.some((u) => u.includes("revolut"))).toBe(false);
  });

  it("accepts an alt-only hint when the image is the link back to the root", () => {
    const html = '<body><a href="/"><img alt="Acme logo" src="/mark.png"></a></body>';
    const candidate = extractLogoCandidates(html, BASE).find((c) =>
      c.url.endsWith("mark.png"),
    )!;

    expect(candidate.origin).toBe("header-img");
    // Corroborated but not structural: below a >=180px apple-touch-icon (95).
    expect(candidate.score).toBeLessThan(95);
  });

  it("gives full confidence to the first structural hint only", () => {
    const html = `
      <body>
        <a href="/"><img class="site-logo" src="/mine.png"></a>
        <img class="logo-item" alt="Someone else" src="/theirs.png">
      </body>`;
    const candidates = extractLogoCandidates(html, BASE);
    const mine = candidates.find((c) => c.url.endsWith("mine.png"))!;
    const theirs = candidates.find((c) => c.url.endsWith("theirs.png"))!;

    expect(mine.score).toBeGreaterThan(theirs.score);
    // A second structural match can never outrank a declared rel=icon (50).
    expect(theirs.score).toBeLessThan(50);
  });
});

describe("extractLogoCandidates — yapily.com regression", () => {
  // Trimmed from the live page. Its real mark is an inline <svg> with no <img>
  // anywhere, so the only raster candidates are a genuine multi-frame .ico and
  // a 1609x847 social card — which is exactly how the card came to be stored.
  // The customer strip is placed inside the 15000-char header window on
  // purpose: on the real site it sits at offset ~36800, and that is luck.
  const YAPILY = `
    <html><head>
      <link rel="icon" type="image/x-icon" href="/favicon.ico?v=1">
      <meta property="og:image" content="https://a.storyblok.com/f/286105250385881/1609x847/7878fd6d15/yapily-open-banking-api-infrastructure-platform.png">
      <meta property="twitter:image" content="https://a.storyblok.com/f/286105250385881/1609x847/7878fd6d15/yapily-open-banking-api-infrastructure-platform.png">
    </head><body>
      <header class="header">
        <a href="/" class="header__logo" aria-label="Return to the homepage">
          <svg viewBox="0 0 151 34" fill="none"><path d="M107.968 0.5H101.7V33.5H116.4Z"/></svg>
        </a>
        <nav><img src="/nav/payments.svg" class="nav-dropdown-item__img" alt></nav>
      </header>
      <section>
        <img class="image-component__img" alt="Adyen logo" src="/adyen-logo-white.png">
        <img class="image-component__img" alt="Revolut logo" src="/revolut_white.png">
      </section>
    </body></html>`;

  it("never offers a customer's mark as the company's own", () => {
    const urls = extractLogoCandidates(YAPILY, "https://www.yapily.com/").map((c) => c.url);
    expect(urls.some((u) => /adyen|revolut/i.test(u))).toBe(false);
  });

  it("is left with only the social card and two dead-end icons", () => {
    const candidates = extractLogoCandidates(YAPILY, "https://www.yapily.com/");
    expect(candidates.map((c) => c.origin)).toEqual([
      "og-image", // tried first, then rejected by isUsableLogoShape
      "link-icon", // the declared /favicon.ico?v=1, scored down to 15
      "favicon-ico", // the blind probe, same real ICO the sniff rejects
    ]);
    // Nothing here carries the confidence of a purpose-built mark, which is the
    // honest reading: yapily has no raster logo, so discovery should come back
    // empty and let the initials fallback do its job.
    expect(candidates.every((c) => c.score < 50)).toBe(true);
  });

  it("rejects the social card once its dimensions are known", () => {
    // The extractor cannot see this — yapily declares no og:image:width — so
    // the shape gate is the only thing standing between us and a hero banner.
    expect(isUsableLogoShape("og-image", 1609, 847)).toBe(false);
  });
});

describe("isUsableLogoShape", () => {
  it("rejects the social-card ratio band at any size", () => {
    expect(isUsableLogoShape("og-image", 1609, 847)).toBe(false); // yapily
    expect(isUsableLogoShape("og-image", 1200, 630)).toBe(false); // OG default
    expect(isUsableLogoShape("og-image", 1200, 600)).toBe(false); // twitter 2:1
    expect(isUsableLogoShape("og-image", 600, 315)).toBe(false); // FB minimum
  });

  it("rejects a large wide og:image outside the band", () => {
    expect(isUsableLogoShape("og-image", 2400, 400)).toBe(false);
  });

  it("keeps an og:image that is plausibly the logo file itself", () => {
    expect(isUsableLogoShape("og-image", 512, 512)).toBe(true);
    expect(isUsableLogoShape("og-image", 1200, 1200)).toBe(true);
    expect(isUsableLogoShape("og-image", 600, 150)).toBe(true);
  });

  it("does not second-guess the shape of a purpose-built icon", () => {
    // The card rule is og-image only: everything above it was pointed at us by
    // the site author as its mark.
    expect(isUsableLogoShape("apple-touch-icon", 1200, 630)).toBe(true);
    expect(isUsableLogoShape("manifest-icon", 1200, 630)).toBe(true);
    expect(isUsableLogoShape("header-img", 600, 80)).toBe(true);
  });

  it("rejects a banner strip from any source", () => {
    expect(isUsableLogoShape("header-img", 2000, 100)).toBe(false);
    expect(isUsableLogoShape("link-icon", 100, 2000)).toBe(false);
  });

  it("rejects degenerate dimensions rather than dividing by zero", () => {
    expect(isUsableLogoShape("header-img", 0, 100)).toBe(false);
    expect(isUsableLogoShape("header-img", 100, 0)).toBe(false);
  });
});

describe("web-app manifest icons", () => {
  it("resolves the manifest href against the page", () => {
    expect(
      extractManifestUrl('<link rel="manifest" href="/static/site.webmanifest">', BASE),
    ).toBe("https://example.com/static/site.webmanifest");
    expect(extractManifestUrl("<html></html>", BASE)).toBeNull();
  });

  it("resolves icon srcs against the MANIFEST url, not the page", () => {
    // The classic bug here: a manifest under /static/ with a relative icon src.
    const candidates = manifestIconCandidates(
      { icons: [{ src: "icons/192.png", sizes: "192x192", type: "image/png" }] },
      "https://example.com/static/site.webmanifest",
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://example.com/static/icons/192.png");
    expect(candidates[0].origin).toBe("manifest-icon");
  });

  it("scores by declared size, below apple-touch-icon and the masthead", () => {
    const [big] = manifestIconCandidates(
      { icons: [{ src: "/a.png", sizes: "512x512" }] },
      "https://example.com/manifest.json",
    );
    const [small] = manifestIconCandidates(
      { icons: [{ src: "/b.png", sizes: "96x96" }] },
      "https://example.com/manifest.json",
    );

    expect(big.score).toBeGreaterThan(small.score);
    expect(big.score).toBeGreaterThan(50); // beats a bare rel=icon
    expect(big.score).toBeLessThan(90); // loses to a structural masthead img
  });

  it("drops monochrome masks, unusable formats and sizes below the floor", () => {
    const urls = manifestIconCandidates(
      {
        icons: [
          { src: "/mono.png", sizes: "512x512", purpose: "monochrome" },
          { src: "/vector.svg", sizes: "512x512" },
          { src: "/tiny.png", sizes: "48x48" },
          { src: "/good.png", sizes: "512x512" },
        ],
      },
      "https://example.com/manifest.json",
    ).map((c) => c.url);

    expect(urls).toEqual(["https://example.com/good.png"]);
  });

  it("demotes a maskable-only icon below its plain equivalent", () => {
    const [maskable] = manifestIconCandidates(
      { icons: [{ src: "/a.png", sizes: "512x512", purpose: "maskable" }] },
      "https://example.com/manifest.json",
    );
    const [plain] = manifestIconCandidates(
      { icons: [{ src: "/b.png", sizes: "512x512", purpose: "any" }] },
      "https://example.com/manifest.json",
    );
    expect(plain.score).toBeGreaterThan(maskable.score);
  });

  it("returns [] for anything that is not a manifest", () => {
    expect(manifestIconCandidates(null, "https://example.com/m.json")).toEqual([]);
    expect(manifestIconCandidates({}, "https://example.com/m.json")).toEqual([]);
    expect(manifestIconCandidates({ icons: "nope" }, "https://example.com/m.json")).toEqual([]);
    expect(manifestIconCandidates({ icons: [{}] }, "https://example.com/m.json")).toEqual([]);
  });
});
