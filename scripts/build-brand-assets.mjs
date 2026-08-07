#!/usr/bin/env node
/**
 * Derives the shipped brand assets from the master logo artwork.
 *
 * Source: `public/tndrx-text.png` — the TNDR-X wordmark plus a baked-in
 * "NETWORK | CONNECT | ACCELERATE" tagline, drawn as fully opaque pixels on a
 * near-white background.
 *
 * Outputs (all under `public/`):
 *   brand/tndrx/wordmark.png    nav/hero wordmark, transparent, tagline cropped off
 *   brand/tndrx/mark.png        the X mark alone, squared, transparent
 *   brand/tndrx/icon-32.png     \
 *   brand/tndrx/icon-192.png     |  favicon / PWA icon set, cut from the mark
 *   brand/tndrx/icon-512.png    /
 *   brand/tndrx/apple-icon.png  apple-touch-icon, flattened onto white
 *   favicon.ico                 multi-size ICO, served at the bare /favicon.ico
 *
 * The tagline is deliberately excluded from the wordmark: it is English-only and
 * the app ships zh-CN and th, so the tagline stays a translated string
 * (`Header.tagline`) rendered beside the image.
 *
 * Run with `node scripts/build-brand-assets.mjs` after replacing the master
 * artwork. Not part of `npm run build` — the outputs are committed.
 *
 * Note: `sharp` is available as a transitive dependency of Next. If that ever
 * stops being true, add it to devDependencies.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "public", "tndrx-text.png");
const OUT_DIR = path.join(root, "public", "brand", "tndrx");

/**
 * Crop boxes measured against the 1279x376 master. `wordmark` stops above the
 * tagline band (rows 289-314 are empty in the source, which is the seam).
 *
 * `markRegion` is deliberately loose: the X overlaps the hyphen of "TNDR-X"
 * horizontally (the hyphen runs to x=1017, the X starts at x=978), so no
 * rectangle separates them. The saturation gate below does that instead, and
 * the result is trimmed to its own content box.
 */
const CROP = {
  wordmark: { left: 6, top: 7, width: 1261, height: 282 },
  markRegion: { left: 940, top: 0, width: 339, height: 289 },
};

/** Padding added around the mark when squaring it, as a fraction of its longest side. */
const MARK_PADDING = 0.06;

/**
 * Coverage below this is treated as background. The master's "white" is not
 * pure — it ranges over roughly 251-255 — so without a floor every background
 * pixel survives at alpha 1-4 with wildly amplified colour, which both washes
 * the logo grey and destroys PNG compression.
 */
const WHITE_FLOOR = 6;

/**
 * Saturation ramp, in 0-255 chroma, used when isolating the X mark. Recovered
 * ink below `lo` is treated as neutral (the charcoal letterforms) and dropped;
 * above `hi` it is kept in full. Unmultiplying restores each pixel's true ink
 * colour before this is measured, so even faint anti-aliased edges of the X
 * still read as saturated.
 */
const SATURATION_GATE = { lo: 20, hi: 55 };

/**
 * Convert a white background to alpha.
 *
 * Treats the artwork as ink composited over white and inverts that: an opaque
 * pixel `c` covering white with coverage `a` satisfies `c = a*ink + (1-a)*255`,
 * so `a = 1 - min(r,g,b)/255` recovers the coverage and unmultiplying recovers
 * the ink. Compositing the result back over white is lossless, and anti-aliased
 * glyph edges plus the X mark's orange/blue gradients survive intact — unlike a
 * threshold key, which leaves a halo.
 *
 * Coverage is rescaled from [WHITE_FLOOR, 255] to [0, 255] so the floor doesn't
 * introduce a visible step at glyph edges.
 *
 * With `saturatedOnly`, alpha is additionally scaled by how colourful the
 * recovered ink is, which keeps the X and discards the neutral letterforms.
 */
async function keyWhiteToAlpha(image, { saturatedOnly = false } = {}) {
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  const scale = 255 / (255 - WHITE_FLOOR);
  const { lo, hi } = SATURATION_GATE;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const raw = 255 - Math.min(r, g, b);

    if (raw <= WHITE_FLOOR) {
      // Background. Leave RGB at 0 so nothing bleeds when resized.
      out[i + 3] = 0;
      continue;
    }

    const coverage = Math.min(255, Math.round((raw - WHITE_FLOOR) * scale));
    const a = coverage / 255;
    const white = (1 - a) * 255;
    const ink = [r, g, b].map((c) =>
      Math.max(0, Math.min(255, Math.round((c - white) / a))),
    );

    let alpha = coverage;
    if (saturatedOnly) {
      const chroma = Math.max(...ink) - Math.min(...ink);
      const gate = Math.max(0, Math.min(1, (chroma - lo) / (hi - lo)));
      alpha = Math.round(alpha * gate);
      if (alpha === 0) {
        out[i + 3] = 0;
        continue;
      }
    }

    out[i] = ink[0];
    out[i + 1] = ink[1];
    out[i + 2] = ink[2];
    out[i + 3] = alpha;
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

/** Tightest box containing every non-transparent pixel, as sharp `extract` args. */
async function alphaBBox(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) throw new Error("no opaque pixels found — check the crop region");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Pack PNG payloads into an ICO container. ICO has supported embedded PNGs
 * since Vista, so each entry is just the PNG bytes with a 16-byte directory
 * header pointing at it.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const directory = entries.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([
    header,
    ...directory,
    ...entries.map(({ png }) => png),
  ]);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const meta = await sharp(SOURCE).metadata();
  console.log(`source ${path.relative(root, SOURCE)} — ${meta.width}x${meta.height}`);

  // Wordmark: crop above the tagline, then key the background out.
  const wordmark = await (
    await keyWhiteToAlpha(sharp(SOURCE).extract(CROP.wordmark))
  )
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(path.join(OUT_DIR, "wordmark.png"), wordmark);

  // Mark: isolate the X by colour, trim to whatever survives, then centre it in
  // a padded square so every icon size below is a straight resize with
  // consistent margins.
  const gated = await (
    await keyWhiteToAlpha(sharp(SOURCE).extract(CROP.markRegion), {
      saturatedOnly: true,
    })
  )
    .png()
    .toBuffer();

  const box = await alphaBBox(gated);
  console.log(
    `  X mark isolated to ${box.width}x${box.height} at ` +
      `(${CROP.markRegion.left + box.left}, ${CROP.markRegion.top + box.top}) in the master`,
  );

  const keyedMark = await sharp(gated).extract(box).png().toBuffer();

  const side = Math.round(
    Math.max(box.width, box.height) * (1 + MARK_PADDING * 2),
  );
  const markSquare = await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: keyedMark, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(path.join(OUT_DIR, "mark.png"), markSquare);

  // Icon set. Resize from the squared mark so all sizes share the same framing.
  const iconAt = (size) =>
    sharp(markSquare)
      .resize(size, size, { kernel: "lanczos3" })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

  for (const size of [32, 192, 512]) {
    await writeFile(path.join(OUT_DIR, `icon-${size}.png`), await iconAt(size));
  }

  // iOS ignores alpha on touch icons and composites onto black, so flatten.
  const appleIcon = await sharp(markSquare)
    .resize(180, 180, { kernel: "lanczos3" })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(OUT_DIR, "apple-icon.png"), appleIcon);

  // favicon.ico lives in public/ so the unprompted GET /favicon.ico is served.
  const icoSizes = [16, 32, 48];
  const ico = buildIco(
    await Promise.all(
      icoSizes.map(async (size) => ({ size, png: await iconAt(size) })),
    ),
  );
  await writeFile(path.join(root, "public", "favicon.ico"), ico);

  const written = [
    ["brand/tndrx/wordmark.png", wordmark.length],
    ["brand/tndrx/mark.png", markSquare.length],
    ["brand/tndrx/apple-icon.png", appleIcon.length],
    ["favicon.ico", ico.length],
  ];
  for (const [name, bytes] of written) {
    console.log(`  ${name} — ${(bytes / 1024).toFixed(1)} KB`);
  }
  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
