import { describe, expect, it } from "vitest";
import {
  backSolveBreakdown,
  CAPABILITY_GATE,
  checkCurationRealism,
  computeOverallScore,
  hasBlockingIssue,
  REALISM_MAX_LIFT,
  REALISM_SCORE_CEILING,
  type ScoreBreakdown,
} from "@/lib/services/curatedMatchScoring";

const NOW = new Date("2026-08-10T00:00:00Z");
const FUTURE = new Date("2026-09-10T00:00:00Z");
const PAST = new Date("2026-07-10T00:00:00Z");

function breakdown(
  capability: number,
  experience: number,
  location: number,
  certification: number,
): ScoreBreakdown {
  return {
    capabilityScore: capability,
    experienceScore: experience,
    locationScore: location,
    certificationScore: certification,
  };
}

describe("computeOverallScore", () => {
  it("zeroes the score below the capability gate, however strong the rest is", () => {
    expect(computeOverallScore(breakdown(CAPABILITY_GATE - 1, 100, 100, 100))).toBe(0);
  });

  it("applies the production weights above the gate", () => {
    // 80*0.5 + 60*0.4 + 40*0.1 = 68
    expect(computeOverallScore(breakdown(90, 60, 40, 80))).toBe(68);
  });
});

describe("backSolveBreakdown", () => {
  const REAL_CASES: Array<[string, ScoreBreakdown]> = [
    ["ruled out on capability", breakdown(20, 0, 0, 0)],
    ["weak but scoring", breakdown(60, 30, 40, 20)],
    ["middling", breakdown(70, 55, 50, 55)],
    ["already strong", breakdown(95, 85, 80, 90)],
    ["no data at all", breakdown(0, 0, 0, 0)],
  ];

  for (const [label, real] of REAL_CASES) {
    for (const target of [1, 25, 55, 72, 88, 97, 100]) {
      it(`reproduces a target of ${target} exactly from a ${label} match`, () => {
        const solved = backSolveBreakdown(target, real);

        // Curation is a floor: a target below what the match already scores is
        // a no-op, and the real breakdown stands. (At exactly the real score the
        // solver may still nudge a point, since the unrounded weighted sum can
        // sit just under the rounded one — it still lands on the target.)
        if (target < computeOverallScore(real)) {
          expect(solved).toEqual(real);
          return;
        }

        // Otherwise the card's own arithmetic has to hold. A breakdown that
        // doesn't reproduce the headline number is the tell.
        expect(computeOverallScore(solved)).toBe(target);
      });
    }
  }

  it("always clears the capability gate", () => {
    for (const [, real] of REAL_CASES) {
      const solved = backSolveBreakdown(80, real);
      expect(solved.capabilityScore).toBeGreaterThanOrEqual(CAPABILITY_GATE);
    }
  });

  it("keeps every dimension inside 0-100", () => {
    const solved = backSolveBreakdown(100, breakdown(10, 0, 0, 0));
    for (const value of Object.values(solved)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("leaves an already-sufficient breakdown untouched", () => {
    // Curation is a floor, so a real score above the target needs no synthetic
    // numbers at all — and rewriting them down would contradict the real score.
    const real = breakdown(90, 85, 80, 90);
    expect(backSolveBreakdown(50, real)).toEqual(real);
  });

  it("does not raise a capability score that already clears the gate", () => {
    const solved = backSolveBreakdown(90, breakdown(62, 10, 10, 10));
    expect(solved.capabilityScore).toBe(62);
  });

  it("moves the heaviest-weighted dimension most", () => {
    const real = breakdown(80, 40, 40, 40);
    const solved = backSolveBreakdown(90, real);
    // Certification carries 0.5 of the score and so absorbs the largest share.
    expect(solved.certificationScore - real.certificationScore).toBeGreaterThan(
      solved.locationScore - real.locationScore,
    );
  });
});

describe("checkCurationRealism", () => {
  const base = {
    curatedScore: 80,
    realScore: 70,
    breakdown: null,
    tenderDeadline: FUTURE,
    tenderStatus: "open",
    siblingScores: [] as number[],
    siblingCount: 0,
    now: NOW,
  };

  it("passes a plausible curation", () => {
    expect(checkCurationRealism(base)).toEqual([]);
  });

  it("blocks a closed tender", () => {
    const issues = checkCurationRealism({ ...base, tenderStatus: "closed" });
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues[0].code).toBe("tenderClosed");
  });

  it("blocks a tender whose deadline has passed", () => {
    const issues = checkCurationRealism({ ...base, tenderDeadline: PAST });
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("deadlinePassed");
  });

  it("blocks a curation that has already expired", () => {
    // activeCurationCondition filters an expired curation out of every
    // user-facing read, so publishing one is a success the admin never got.
    const issues = checkCurationRealism({ ...base, curationExpiresAt: PAST });
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("curationExpired");
  });

  it("leaves an unexpired or never-expiring curation alone", () => {
    expect(
      checkCurationRealism({ ...base, curationExpiresAt: null }).map((i) => i.code),
    ).not.toContain("curationExpired");
    expect(
      checkCurationRealism({ ...base, curationExpiresAt: FUTURE }).map((i) => i.code),
    ).not.toContain("curationExpired");
  });

  it("warns above the score ceiling", () => {
    const issues = checkCurationRealism({
      ...base,
      curatedScore: REALISM_SCORE_CEILING + 1,
    });
    expect(issues.map((i) => i.code)).toContain("scoreTooHigh");
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("warns when another live curation shows the same score", () => {
    const issues = checkCurationRealism({ ...base, siblingScores: [80] });
    expect(issues.map((i) => i.code)).toContain("duplicateScore");
  });

  it("warns on an implausibly large lift", () => {
    const issues = checkCurationRealism({
      ...base,
      realScore: 10,
      curatedScore: 10 + REALISM_MAX_LIFT + 1,
    });
    expect(issues.map((i) => i.code)).toContain("liftTooLarge");
  });

  it("warns when a dimension had to be maxed out", () => {
    const issues = checkCurationRealism({
      ...base,
      breakdown: breakdown(80, 100, 50, 60),
    });
    expect(issues.map((i) => i.code)).toContain("dimensionMaxed");
  });

  it("warns once a company's feed carries too many curations", () => {
    const issues = checkCurationRealism({ ...base, siblingCount: 5 });
    expect(issues.map((i) => i.code)).toContain("tooManyCurations");
  });

  it("skips the score checks entirely for an evidence-only curation", () => {
    const issues = checkCurationRealism({ ...base, curatedScore: null });
    expect(issues).toEqual([]);
  });
});
