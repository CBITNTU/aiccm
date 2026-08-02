import { describe, it, expect } from "vitest";
import {
  deriveVerificationDisplayState,
  verificationStateConfig,
  type VerificationDisplayState,
} from "@/lib/verification-utils";

describe("deriveVerificationDisplayState", () => {
  describe("pending request priority", () => {
    it("returns pending regardless of verification status or pending changes", () => {
      expect(deriveVerificationDisplayState(null, "pending", false)).toBe(
        "pending",
      );
      expect(deriveVerificationDisplayState("verified", "pending", false)).toBe(
        "pending",
      );
      expect(deriveVerificationDisplayState("verified", "pending", true)).toBe(
        "pending",
      );
      expect(deriveVerificationDisplayState(undefined, "pending", true)).toBe(
        "pending",
      );
    });
  });

  describe("changes_requested", () => {
    it("applies only while pending changes still exist", () => {
      expect(
        deriveVerificationDisplayState(null, "changes_requested", true),
      ).toBe("changes_requested");
      expect(
        deriveVerificationDisplayState("verified", "changes_requested", true),
      ).toBe("changes_requested");
    });

    it("is stale without pending changes and falls through", () => {
      expect(
        deriveVerificationDisplayState("verified", "changes_requested", false),
      ).toBe("verified");
      expect(
        deriveVerificationDisplayState(null, "changes_requested", false),
      ).toBe("unverified");
    });
  });

  describe("rejected", () => {
    it("applies only while pending changes still exist", () => {
      expect(deriveVerificationDisplayState(null, "rejected", true)).toBe(
        "rejected",
      );
      expect(deriveVerificationDisplayState("verified", "rejected", true)).toBe(
        "rejected",
      );
    });

    it("is stale without pending changes and falls through", () => {
      expect(deriveVerificationDisplayState("verified", "rejected", false)).toBe(
        "verified",
      );
      expect(deriveVerificationDisplayState(null, "rejected", false)).toBe(
        "unverified",
      );
    });

    it("changes_requested takes priority over rejected ordering is moot: only one latestRequestStatus exists", () => {
      // Documenting that the function takes a single latest status, so the
      // two branches are mutually exclusive by construction.
      expect(deriveVerificationDisplayState(null, "rejected", true)).toBe(
        "rejected",
      );
    });
  });

  describe("verified / unverified fallbacks", () => {
    it("returns verified when verificationStatus is verified and no actionable request", () => {
      expect(deriveVerificationDisplayState("verified", null, false)).toBe(
        "verified",
      );
      expect(deriveVerificationDisplayState("verified", undefined, true)).toBe(
        "verified",
      );
      expect(deriveVerificationDisplayState("verified", "approved", false)).toBe(
        "verified",
      );
    });

    it("returns unverified for any other verification status", () => {
      expect(deriveVerificationDisplayState(null, null, false)).toBe("unverified");
      expect(deriveVerificationDisplayState(undefined, undefined, false)).toBe(
        "unverified",
      );
      expect(
        deriveVerificationDisplayState("pending_verification", null, false),
      ).toBe("unverified");
      expect(deriveVerificationDisplayState("unverified", null, true)).toBe(
        "unverified",
      );
    });

    it("ignores unknown request statuses", () => {
      expect(deriveVerificationDisplayState("verified", "approved", true)).toBe(
        "verified",
      );
      expect(deriveVerificationDisplayState(null, "withdrawn", true)).toBe(
        "unverified",
      );
    });
  });
});

describe("verificationStateConfig", () => {
  it("covers every display state", () => {
    const states: VerificationDisplayState[] = [
      "verified",
      "pending",
      "changes_requested",
      "rejected",
      "unverified",
    ];
    for (const state of states) {
      expect(verificationStateConfig[state]).toBeDefined();
      expect(verificationStateConfig[state].label).toEqual(expect.any(String));
      expect(verificationStateConfig[state].dotColor).toMatch(/^bg-/);
      expect(typeof verificationStateConfig[state].pulse).toBe("boolean");
    }
  });

  it("pulses only for actionable states", () => {
    expect(verificationStateConfig.changes_requested.pulse).toBe(true);
    expect(verificationStateConfig.rejected.pulse).toBe(true);
    expect(verificationStateConfig.verified.pulse).toBe(false);
    expect(verificationStateConfig.pending.pulse).toBe(false);
    expect(verificationStateConfig.unverified.pulse).toBe(false);
  });
});
