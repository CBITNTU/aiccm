"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useDeployment } from "@/lib/deployment/client";

/**
 * Intrinsic dimensions of the assets produced by `scripts/build-brand-assets.mjs`.
 * next/image needs these to reserve layout space; a region swapping in its own
 * artwork must keep the same aspect ratios (see public/brand/README.md).
 */
const INTRINSIC = {
  wordmark: { width: 1261, height: 282 },
  mark: { width: 338, height: 338 },
} as const;

interface BrandLogoProps {
  /** "wordmark" is the full lockup; "mark" is the square X, for tight spaces. */
  variant?: keyof typeof INTRINSIC;
  /** Callers set the height, e.g. "h-8". Width is derived from the aspect ratio. */
  className?: string;
  /** Set on above-the-fold instances (the header) to avoid a lazy-load flash. */
  priority?: boolean;
}

export function BrandLogo({
  variant = "wordmark",
  className,
  priority,
}: BrandLogoProps) {
  const { brand } = useDeployment();
  const src =
    variant === "mark" ? (brand.markPath ?? brand.logoPath) : brand.logoPath;

  return (
    <Image
      src={src}
      alt={brand.name}
      width={INTRINSIC[variant].width}
      height={INTRINSIC[variant].height}
      priority={priority}
      className={cn("w-auto object-contain", className)}
    />
  );
}
