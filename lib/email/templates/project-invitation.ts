import { getPlatformName } from "../index";
import { escapeHtml } from "../utils";

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
}

export function getProjectInvitationEmailSubject(
  data: ProjectInvitationEmailData,
): string {
  return `Project Collaboration Invitation: ${escapeHtml(data.projectName)} — ${getPlatformName()}`;
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
  const recipientName = escapeHtml(data.recipientName);
  const invitingCompanyName = escapeHtml(data.invitingCompanyName);
  const invitingCompanyContact = escapeHtml(data.invitingCompanyContact);
  const projectName = escapeHtml(data.projectName);
  const platformName = getPlatformName();

  const tenderSection =
    tenderTitle
      ? `
    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #2563EB;">Tender Details</h3>
      <table style="width: 100%; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #666; width: 120px;">Title:</td><td style="padding: 4px 0; font-weight: 500;">${escapeHtml(tenderTitle)}</td></tr>
        ${tenderBuyer ? `<tr><td style="padding: 4px 0; color: #666;">Buyer:</td><td style="padding: 4px 0;">${escapeHtml(tenderBuyer)}</td></tr>` : ""}
        ${tenderDeadline ? `<tr><td style="padding: 4px 0; color: #666;">Deadline:</td><td style="padding: 4px 0;">${escapeHtml(tenderDeadline)}</td></tr>` : ""}
        ${tenderValue ? `<tr><td style="padding: 4px 0; color: #666;">Est. Value:</td><td style="padding: 4px 0;">${escapeHtml(tenderValue)}</td></tr>` : ""}
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
    <h1 style="color: white; margin: 0; font-size: 24px;">Project Collaboration Invitation</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello ${recipientName},</p>

    <p><strong>${invitingCompanyName}</strong> has invited your company to collaborate on the project <strong>${projectName}</strong> via ${platformName}.</p>

    ${projectDescription ? `<p style="color: #555;">${escapeHtml(projectDescription)}</p>` : ""}

    <div style="background: #f0f9ff; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px;"><strong>Contact:</strong> ${invitingCompanyContact}</p>
    </div>

    ${tenderSection}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${invitationLink}" style="display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Invitation</a>
    </div>

    <p style="color: #666; font-size: 14px;">
      Click the button above to review the invitation details and accept or decline.
      If you didn't expect this invitation, you can safely ignore this email.
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. If the button above doesn't work,
      copy and paste this link into your browser:
    </p>
    <p style="color: #2563EB; font-size: 12px; word-break: break-all;">
      ${invitationLink}
    </p>
  </div>
</body>
</html>
  `.trim();
}
