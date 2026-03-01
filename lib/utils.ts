import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Derives a coverage percentage from competency list counts.
 * Falls back to `fallback` (default 0) when both lists are empty.
 */
export function deriveCoverage(
  covered: string[],
  missing: string[],
  fallback = 0,
): number {
  const total = covered.length + missing.length;
  return total > 0 ? Math.round((covered.length / total) * 100) : fallback;
}
