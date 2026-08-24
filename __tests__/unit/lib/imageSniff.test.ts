import { describe, it, expect } from "vitest";
import {
  sniffImageKind,
  readImageDimensions,
  IMAGE_MIME,
  IMAGE_EXT,
} from "@/lib/images/sniff";

/** Minimal PNG: signature + IHDR length/type + width/height. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR chunk length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** Minimal JPEG: SOI, a filler APP0 segment, then an SOF0 frame header. */
function jpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8], 0); // SOI
  // APP0 with length 4 (2 length bytes + 2 payload) so the walker must skip it.
  bytes.set([0xff, 0xe0], 2);
  view.setUint16(4, 4);
  // SOF0 at offset 8: marker, length, precision, height, width
  bytes.set([0xff, 0xc0], 8);
  view.setUint16(10, 17);
  bytes[12] = 8;
  view.setUint16(13, height);
  view.setUint16(15, width);
  return bytes;
}

function gifHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([...new TextEncoder().encode("GIF89a")], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** WebP in extended (VP8X) form, which carries 24-bit minus-one dimensions. */
function webpVp8xHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  const enc = new TextEncoder();
  bytes.set(enc.encode("RIFF"), 0);
  bytes.set(enc.encode("WEBP"), 8);
  bytes.set(enc.encode("VP8X"), 12);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

describe("sniffImageKind", () => {
  it("identifies each supported raster format by magic bytes", () => {
    expect(sniffImageKind(pngHeader(64, 64))).toBe("png");
    expect(sniffImageKind(jpegHeader(64, 64))).toBe("jpeg");
    expect(sniffImageKind(gifHeader(64, 64))).toBe("gif");
    expect(sniffImageKind(webpVp8xHeader(64, 64))).toBe("webp");
  });

  it("accepts GIF87a as well as GIF89a", () => {
    const bytes = gifHeader(10, 10);
    bytes.set(new TextEncoder().encode("GIF87a"), 0);
    expect(sniffImageKind(bytes)).toBe("gif");
  });

  it("rejects SVG — it has no magic number and can carry script", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(sniffImageKind(svg)).toBeNull();
  });

  it("rejects ICO, PDF, ZIP and empty or truncated input", () => {
    expect(sniffImageKind(new Uint8Array([0x00, 0x00, 0x01, 0x00]))).toBeNull(); // ICO
    expect(sniffImageKind(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP
    expect(sniffImageKind(new Uint8Array(0))).toBeNull();
    expect(sniffImageKind(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("trusts bytes over the declared name and content type", () => {
    // A PNG uploaded as "logo.svg" with Content-Type image/svg+xml is still a
    // PNG. This is the whole reason the sniff exists.
    expect(sniffImageKind(pngHeader(128, 128))).toBe("png");
    // ...and the reverse: SVG bytes sent as image/png are still rejected.
    expect(sniffImageKind(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(readImageDimensions(pngHeader(512, 256), "png")).toEqual({
      width: 512,
      height: 256,
    });
  });

  it("reads JPEG dimensions by walking to the first SOF marker", () => {
    expect(readImageDimensions(jpegHeader(300, 200), "jpeg")).toEqual({
      width: 300,
      height: 200,
    });
  });

  it("reads GIF dimensions from the logical screen descriptor", () => {
    expect(readImageDimensions(gifHeader(48, 32), "gif")).toEqual({
      width: 48,
      height: 32,
    });
  });

  it("reads WebP VP8X dimensions", () => {
    expect(readImageDimensions(webpVp8xHeader(1024, 768), "webp")).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("returns null rather than throwing on truncated input", () => {
    expect(readImageDimensions(new Uint8Array([0x89, 0x50, 0x4e]), "png")).toBeNull();
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff]), "jpeg")).toBeNull();
    expect(readImageDimensions(new Uint8Array(4), "webp")).toBeNull();
  });

  it("returns null for an unrecognised WebP sub-chunk", () => {
    const bytes = webpVp8xHeader(64, 64);
    bytes.set(new TextEncoder().encode("XXXX"), 12);
    expect(readImageDimensions(bytes, "webp")).toBeNull();
  });
});

describe("format tables", () => {
  it("maps every kind to a MIME type and an extension", () => {
    for (const kind of ["png", "jpeg", "webp", "gif"] as const) {
      expect(IMAGE_MIME[kind]).toMatch(/^image\//);
      expect(IMAGE_EXT[kind]).toMatch(/^[a-z]+$/);
    }
  });
});
