/**
 * Dependency-free image identification and dimension reading.
 *
 * We deliberately do not depend on `sharp`. It is present in node_modules
 * transitively (Next's image optimizer) but is not a declared dependency, so
 * relying on it would be relying on a hoisting accident — and declaring it adds
 * a ~30MB platform-specific native binary to every function bundle for a job
 * that is 60 lines of header parsing. We only ever need (kind, width, height);
 * we never re-encode.
 */

export type ImageKind = "png" | "jpeg" | "webp" | "gif";

export const IMAGE_MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const IMAGE_EXT: Record<ImageKind, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Identify an image by its magic bytes.
 *
 * Both the browser's `Content-Type` on an upload and the origin server's
 * `Content-Type` on a scrape are attacker-influenced; this is not. Returns null
 * for anything unrecognised — notably SVG, which is XML with no magic number
 * and is therefore rejected by construction rather than by an allowlist we
 * could forget to update.
 */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 6) {
    const header = ascii(bytes, 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "gif";
  }
  return null;
}

/**
 * Read intrinsic dimensions from an image header. Returns null rather than
 * throwing on truncated or corrupt input — callers treat "unknown size" as a
 * rejection, never as a crash.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  kind: ImageKind,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (kind === "png") {
      // IHDR is always the first chunk: width @16, height @20, big-endian.
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    if (kind === "gif") {
      // Logical screen descriptor, little-endian.
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }

    if (kind === "webp") {
      const fourcc = ascii(bytes, 12, 16);
      if (fourcc === "VP8X") {
        const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
        const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
        return { width, height };
      }
      if (fourcc === "VP8 ") {
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      }
      if (fourcc === "VP8L") {
        const bits =
          bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }

    // JPEG: walk the marker chain to the first SOFn frame header.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF0..SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      const segmentLength = view.getUint16(i + 2);
      if (segmentLength < 2) return null;
      i += 2 + segmentLength;
    }
    return null;
  } catch {
    return null;
  }
}
