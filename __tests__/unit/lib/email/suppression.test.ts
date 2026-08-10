import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("@/lib/deployment", () => ({
  getActiveProfile: () => ({
    brand: {
      name: "Test Platform",
      supportEmail: "support@test.example",
      supportUrl: "https://test.example",
    },
  }),
}));

const sendMock = vi.hoisted(() => vi.fn());

import { sendEmail } from "@/lib/email";
import {
  enableEmailSuppression,
  getEmailSuppression,
  isEmailSuppressed,
  withEmailSuppression,
  withEmailSuppressionDisabled,
} from "@/lib/email/suppression";

const options = {
  to: "user@example.com",
  subject: "Your account is ready",
  html: "<p>Hello</p>",
};

beforeEach(() => {
  vi.clearAllMocks();
  // sendEmail short-circuits in development before ever reaching Resend, which
  // would mask whether suppression fired.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  sendMock.mockResolvedValue({ data: { id: "sent-1" }, error: null });
});

describe("email suppression", () => {
  it("sends normally when there is no suppression scope", async () => {
    const result = await sendEmail(options);

    expect(result.success).toBe(true);
    expect(result.suppressed).toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("withholds the send inside withEmailSuppression", async () => {
    const result = await withEmailSuppression(
      { reason: "admin-acting-on-behalf", actorUserId: "admin-1" },
      async () => sendEmail(options),
    );

    expect(result.suppressed).toBe(true);
    // Reported as a success so callers that check the result don't error out.
    expect(result.success).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("records every withheld recipient for auditing", async () => {
    await withEmailSuppression(
      { reason: "admin-impersonation" },
      async (context) => {
        await sendEmail({ ...options, to: ["a@example.com", "b@example.com"] });
        await sendEmail({ ...options, subject: "Second" });

        expect(context.suppressed).toHaveLength(3);
        expect(context.suppressed.map((e) => e.to)).toEqual([
          "a@example.com",
          "b@example.com",
          "user@example.com",
        ]);
        expect(context.suppressed[2].subject).toBe("Second");
      },
    );
  });

  it("survives await boundaries and fire-and-forget continuations", async () => {
    // Mirrors triggerAIPrefill: work kicked off inside the scope but awaited later.
    let pending!: Promise<{ suppressed?: boolean }>;

    await withEmailSuppression({ reason: "admin-acting-on-behalf" }, async () => {
      pending = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return sendEmail(options);
      })();
    });

    const result = await pending;
    expect(result.suppressed).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("enableEmailSuppression applies to the rest of the async context", async () => {
    await (async () => {
      expect(isEmailSuppressed()).toBe(false);
      enableEmailSuppression({ reason: "admin-impersonation" });
      expect(isEmailSuppressed()).toBe(true);

      const result = await sendEmail(options);
      expect(result.suppressed).toBe(true);
    })();

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("exposes the active context, including who is acting", async () => {
    await withEmailSuppression(
      {
        reason: "admin-impersonation",
        actorUserId: "admin-1",
        targetUserId: "user-9",
      },
      async () => {
        const context = getEmailSuppression();
        expect(context?.reason).toBe("admin-impersonation");
        expect(context?.actorUserId).toBe("admin-1");
        expect(context?.targetUserId).toBe("user-9");
      },
    );

    expect(getEmailSuppression()).toBeUndefined();
  });

  it("lets an explicit opt-out send inside a suppression scope", async () => {
    // The approval email itself must still reach the user at the end of a
    // prepared-by-admin flow.
    await withEmailSuppression({ reason: "admin-acting-on-behalf" }, async () => {
      await withEmailSuppressionDisabled(() => sendEmail(options));
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
