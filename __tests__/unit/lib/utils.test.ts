import { describe, it, expect } from "vitest";
import { deriveCoverage } from "@/lib/utils";

describe("deriveCoverage", () => {
  it("returns the rounded percentage of covered items", () => {
    expect(deriveCoverage(["a", "b", "c"], ["d"])).toBe(75);
    expect(deriveCoverage(["a"], ["b", "c"])).toBe(33);
  });

  it("returns 100 when nothing is missing", () => {
    expect(deriveCoverage(["a"], [])).toBe(100);
  });

  it("returns 0 when everything is missing", () => {
    expect(deriveCoverage([], ["a", "b"])).toBe(0);
  });

  it("returns the fallback when both lists are empty", () => {
    expect(deriveCoverage([], [])).toBe(0);
    expect(deriveCoverage([], [], 50)).toBe(50);
  });
});
