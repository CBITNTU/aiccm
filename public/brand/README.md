# Brand assets

All shipped brand imagery is **derived**, not hand-edited. The master artwork is
`public/tndrx-text.png` (the TNDR-X wordmark with its baked-in
"NETWORK | CONNECT | ACCELERATE" tagline, drawn on an opaque near-white
background). Everything under `tndrx/` plus `public/favicon.ico` is generated
from it by:

```bash
node scripts/build-brand-assets.mjs
```

The outputs are committed, so you only need to re-run this after replacing the
master artwork.

## Files

| File | Used by |
| --- | --- |
| `tndrx/wordmark.png` | `<BrandLogo />` default — header, sidenav, auth page |
| `tndrx/mark.png` | `<BrandLogo variant="mark" />` — collapsed sidenav rail, loading splashes |
| `tndrx/icon-32.png`, `icon-192.png`, `icon-512.png` | favicon / home-screen icon set |
| `tndrx/apple-icon.png` | apple-touch-icon (180px, flattened onto white — iOS ignores alpha) |
| `../favicon.ico` | multi-size ICO at the root, for the unprompted `GET /favicon.ico` |

Two details worth knowing about the generation:

- The background is **keyed to alpha** by treating the artwork as ink composited
  over white and inverting that, so the logo sits cleanly on any surface. A plain
  threshold key would leave a halo on the anti-aliased edges.
- The X mark **overlaps the hyphen of "TNDR-X" horizontally**, so it can't be cut
  out with a rectangle. The script isolates it by colour saturation instead — the
  X is saturated, the letterforms are neutral charcoal.

The wordmark deliberately **excludes the tagline** baked into the master: it is
English-only, and the app ships `en`, `zh-CN`, and `th`. The tagline beside the
logo is the translated `Header.tagline` string instead.

## Per-deployment branding

Each deployment profile (`lib/deployment/profiles/*`) points `brand.logoPath`,
`brand.markPath`, `brand.faviconPath`, `brand.iconPath`, and
`brand.appleIconPath` at files served from `public/`. All three profiles (uk, cn,
th) currently share the assets above — the TNDR-X mark is region-neutral.

To give a region its own artwork, drop it under `public/brand/<region>/` and
repoint that profile. `<BrandLogo />` hardcodes the intrinsic dimensions of the
shared assets, so replacements must keep the same aspect ratios (wordmark
1261×282, mark square) or `components/layout/BrandLogo.tsx` needs updating to
match.

## Known gap: dark mode

`app/globals.css` defines a full `.dark` palette, but nothing currently applies
the class. The wordmark's "TNDR" is charcoal and would be near-invisible on a
dark background, so a light-ink variant will be needed the day dark mode is
switched on. The X mark reads fine on both.
