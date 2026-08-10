import { describe, it, expect } from "vitest";
import {
  getPasswordResetEmailSubject,
  getPasswordResetEmailHtml,
  type PasswordResetEmailData,
} from "@/lib/email/templates/password-reset";
import { locales, type Locale } from "@/i18n/locales";
import enMessages from "@/messages/en.json";

const RESET_LINK =
  "http://localhost:3000/api/auth/reset-password/tok_123?callbackURL=%2Fauth%2Freset-password";

function data(locale: Locale): PasswordResetEmailData {
  return { resetLink: RESET_LINK, expiresInMinutes: 60, locale };
}

describe("password reset email template", () => {
  it("renders the reset link in both the CTA and the copy/paste footer", () => {
    const html = getPasswordResetEmailHtml(data("en"));

    // The template HTML-escapes the link, so the raw `&` becomes `&amp;` —
    // compare against the escaped form the browser will resolve back.
    const escaped = RESET_LINK.replace(/&/g, "&amp;");
    expect(html).toContain(`href="${escaped}"`);
    // Once in the button, once in the plain-text fallback at the bottom.
    expect(html.split(escaped)).toHaveLength(3);
  });

  it("states the expiry window and the sign-out consequence", () => {
    const html = getPasswordResetEmailHtml(data("en"));
    expect(html).toContain("60 minutes");
    expect(html).toContain(enMessages.Emails.passwordReset.signOutNote);
  });

  it("escapes a link that tries to break out of the href attribute", () => {
    const html = getPasswordResetEmailHtml({
      resetLink: '/x" onmouseover="alert(1)',
      expiresInMinutes: 60,
      locale: "en",
    });
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it.each(locales)("renders %s without leaving keys untranslated", (locale) => {
    const subject = getPasswordResetEmailSubject(data(locale));
    const html = getPasswordResetEmailHtml(data(locale));

    // next-intl echoes the full key path when a message is missing.
    expect(subject).not.toContain("passwordReset.");
    expect(html).not.toContain("passwordReset.");
    expect(html).not.toContain("Emails.");
    expect(subject.length).toBeGreaterThan(0);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("localises the copy differently per locale", () => {
    const [en, zh, th] = locales.map((locale) =>
      getPasswordResetEmailSubject(data(locale)),
    );
    expect(new Set([en, zh, th]).size).toBe(3);
  });
});
