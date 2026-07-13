import { getPlatformName } from "../index";
import { escapeHtml } from "../utils";
import { type Locale } from "@/i18n/locales";
import { getEmailTranslator, strongTag, emailDateLocale } from "../i18n";

export interface TeamInvitationEmailData {
  inviteeEmail: string;
  inviterName: string;
  companyName: string;
  inviteLink: string;
  expiresAt: Date;
  locale: Locale;
}

export function getTeamInvitationEmailSubject(
  data: TeamInvitationEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  return t("teamInvitation.subject", {
    companyName: escapeHtml(data.companyName),
    platformName: getPlatformName(),
  });
}

export function getTeamInvitationEmailHtml(
  data: TeamInvitationEmailData,
): string {
  const { inviteLink, expiresAt } = data;
  const t = getEmailTranslator(data.locale);
  const inviterName = escapeHtml(data.inviterName);
  const companyName = escapeHtml(data.companyName);
  const platformName = getPlatformName();

  // Format expiry date
  const expiryFormatted = expiresAt.toLocaleDateString(
    emailDateLocale(data.locale),
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  const benefits = (t.raw("teamInvitation.benefits") as string[])
    .map((item) => `        <li>${item}</li>`)
    .join("\n");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("teamInvitation.heading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t("helloThere")}</p>

    <p>${t.rich("teamInvitation.invitedBy", { b: strongTag, inviterName, companyName, platformName })}</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #2563EB;">${t("teamInvitation.whatIsHeading", { platformName })}</h3>
      <p style="margin: 0;">
        ${t("teamInvitation.whatIsBody", { platformName })}
      </p>
      <ul style="margin: 10px 0; padding-left: 20px;">
${benefits}
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">${t("teamInvitation.button")}</a>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #92400e;">${t("teamInvitation.expiresOn", { expiryDate: expiryFormatted })}</p>
      <p style="margin: 5px 0 0 0; color: #92400e; font-size: 14px;">
        ${t("teamInvitation.expiryNote", { inviterName })}
      </p>
    </div>

    <p style="color: #666; font-size: 14px;">
      ${t("teamInvitation.ignore")}
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("teamInvitation.footer", { platformName })}
    </p>
    <p style="color: #2563EB; font-size: 12px; word-break: break-all;">
      ${inviteLink}
    </p>
  </div>
</body>
</html>
  `.trim();
}
