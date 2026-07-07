import { getPlatformName, getPlatformUrl } from "../index";
import { escapeHtml } from "../utils";
import { type Locale } from "@/i18n/locales";
import { getEmailTranslator, strongTag } from "../i18n";

export interface CompanyJoinRequestEmailData {
  companyAdminName: string;
  companyId: string;
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterJobTitle?: string;
  message?: string;
  locale: Locale;
}

export function getCompanyJoinRequestEmailSubject(
  data: CompanyJoinRequestEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  return t("companyJoinRequest.subject", {
    requesterName: data.requesterName,
    companyName: data.companyName,
  });
}

export function getCompanyJoinRequestEmailHtml(
  data: CompanyJoinRequestEmailData,
): string {
  const { companyId } = data;
  const t = getEmailTranslator(data.locale);
  const companyAdminName = escapeHtml(data.companyAdminName);
  const companyName = escapeHtml(data.companyName);
  const requesterName = escapeHtml(data.requesterName);
  const requesterEmail = escapeHtml(data.requesterEmail);
  const requesterJobTitle = data.requesterJobTitle
    ? escapeHtml(data.requesterJobTitle)
    : undefined;
  const message = data.message ? escapeHtml(data.message) : undefined;
  const platformName = getPlatformName();
  const membersUrl = getPlatformUrl(`/company/${companyId}?tab=team`);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Join Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2563EB; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("companyJoinRequest.heading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t.rich("hello", { b: strongTag, name: companyAdminName })}</p>

    <p>${t("companyJoinRequest.intro", { platformName })}</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #2563EB;">${t("companyJoinRequest.detailsHeading")}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 120px;">${t("labels.name")}</td>
          <td style="padding: 8px 0;">${requesterName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">${t("labels.email")}</td>
          <td style="padding: 8px 0;"><a href="mailto:${requesterEmail}" style="color: #2563EB;">${requesterEmail}</a></td>
        </tr>
        ${
          requesterJobTitle
            ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">${t("labels.jobTitle")}</td>
          <td style="padding: 8px 0;">${requesterJobTitle}</td>
        </tr>
        `
            : ""
        }
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">${t("labels.company")}</td>
          <td style="padding: 8px 0;">${companyName}</td>
        </tr>
      </table>
    </div>

    ${
      message
        ? `
    <div style="background: #f3f4f6; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">${t("companyJoinRequest.messageFrom", { requesterName })}</p>
      <p style="margin: 10px 0 0 0; font-style: italic;">"${message}"</p>
    </div>
    `
        : ""
    }

    <div style="background: #DBEAFE; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>${t("companyJoinRequest.whatNextHeading")}</strong></p>
      <p style="margin: 10px 0 0 0;">${t("companyJoinRequest.whatNextBody")}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${membersUrl}" style="display: inline-block; background: #2563EB; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">${t("companyJoinRequest.button")}</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("companyJoinRequest.footer", { platformName, companyName })}
    </p>
  </div>
</body>
</html>
  `.trim();
}
