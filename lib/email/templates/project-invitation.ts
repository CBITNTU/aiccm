import { getPlatformName } from "../index";
import { escapeHtml } from "../utils";
import { type Locale } from "@/i18n/locales";
import { getEmailTranslator, strongTag } from "../i18n";

export interface ProjectInvitationEmailData {
  recipientName: string;
  invitingCompanyName: string;
  invitingCompanyContact: string;
  projectName: string;
  projectDescription?: string;
  tenderTitle?: string;
  tenderBuyer?: string;
  tenderDeadline?: string;
  tenderValue?: string;
  invitationLink: string;
  locale: Locale;
}

export function getProjectInvitationEmailSubject(
  data: ProjectInvitationEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  return t("projectInvitation.subject", {
    projectName: escapeHtml(data.projectName),
    platformName: getPlatformName(),
  });
}

export function getProjectInvitationEmailHtml(
  data: ProjectInvitationEmailData,
): string {
  const {
    invitationLink,
    projectDescription,
    tenderTitle,
    tenderBuyer,
    tenderDeadline,
    tenderValue,
  } = data;
  const t = getEmailTranslator(data.locale);
  const recipientName = escapeHtml(data.recipientName);
  const invitingCompanyName = escapeHtml(data.invitingCompanyName);
  const invitingCompanyContact = escapeHtml(data.invitingCompanyContact);
  const projectName = escapeHtml(data.projectName);
  const platformName = getPlatformName();

  const tenderSection =
    tenderTitle
      ? `
    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #2563EB;">${t("projectInvitation.tenderHeading")}</h3>
      <table style="width: 100%; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #666; width: 120px;">${t("labels.title")}</td><td style="padding: 4px 0; font-weight: 500;">${escapeHtml(tenderTitle)}</td></tr>
        ${tenderBuyer ? `<tr><td style="padding: 4px 0; color: #666;">${t("labels.buyer")}</td><td style="padding: 4px 0;">${escapeHtml(tenderBuyer)}</td></tr>` : ""}
        ${tenderDeadline ? `<tr><td style="padding: 4px 0; color: #666;">${t("labels.deadline")}</td><td style="padding: 4px 0;">${escapeHtml(tenderDeadline)}</td></tr>` : ""}
        ${tenderValue ? `<tr><td style="padding: 4px 0; color: #666;">${t("labels.estValue")}</td><td style="padding: 4px 0;">${escapeHtml(tenderValue)}</td></tr>` : ""}
      </table>
    </div>`
      : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Collaboration Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("projectInvitation.heading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t("helloPlain", { name: recipientName })}</p>

    <p>${t.rich("projectInvitation.invitedBy", { b: strongTag, invitingCompanyName, projectName, platformName })}</p>

    ${projectDescription ? `<p style="color: #555;">${escapeHtml(projectDescription)}</p>` : ""}

    <div style="background: #f0f9ff; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px;"><strong>${t("projectInvitation.contactLabel")}</strong> ${invitingCompanyContact}</p>
    </div>

    ${tenderSection}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${invitationLink}" style="display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">${t("projectInvitation.button")}</a>
    </div>

    <p style="color: #666; font-size: 14px;">
      ${t("projectInvitation.disclaimer")}
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("projectInvitation.footer", { platformName })}
    </p>
    <p style="color: #2563EB; font-size: 12px; word-break: break-all;">
      ${invitationLink}
    </p>
  </div>
</body>
</html>
  `.trim();
}
