import { getPlatformName } from "../index";
import { escapeHtml } from "../utils";
import { type Locale } from "@/i18n/locales";
import { getEmailTranslator } from "../i18n";

export interface PasswordResetEmailData {
  /** Better-Auth reset URL — consumes the token and redirects to /auth/reset-password. */
  resetLink: string;
  /** Token lifetime, in minutes, kept in sync with `resetPasswordTokenExpiresIn`. */
  expiresInMinutes: number;
  locale: Locale;
}

export function getPasswordResetEmailSubject(
  data: PasswordResetEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  return t("passwordReset.subject", { platformName: getPlatformName() });
}

export function getPasswordResetEmailHtml(
  data: PasswordResetEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  const platformName = getPlatformName();
  // Better-Auth builds the link, but escape it anyway so the template can never
  // be the thing that breaks out of the attribute.
  const resetLink = escapeHtml(data.resetLink);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("passwordReset.heading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t("helloThere")}</p>

    <p>${t("passwordReset.instruction", { platformName })}</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">${t("passwordReset.button")}</a>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #92400e;">${t("passwordReset.expiry", { minutes: data.expiresInMinutes })}</p>
      <p style="margin: 5px 0 0 0; color: #92400e; font-size: 14px;">
        ${t("passwordReset.signOutNote")}
      </p>
    </div>

    <p style="color: #666; font-size: 14px;">
      ${t("passwordReset.ignore")}
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("passwordReset.footer", { platformName })}
    </p>
    <p style="color: #2563EB; font-size: 12px; word-break: break-all;">
      ${resetLink}
    </p>
  </div>
</body>
</html>
  `.trim();
}
