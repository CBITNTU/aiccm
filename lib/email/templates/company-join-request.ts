import { getPlatformName, getPlatformUrl } from "../index";
import { escapeHtml } from "../utils";

export interface CompanyJoinRequestEmailData {
  companyAdminName: string;
  companyId: string;
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterJobTitle?: string;
  message?: string;
}

export function getCompanyJoinRequestEmailSubject(
  data: CompanyJoinRequestEmailData,
): string {
  return `[Action Required] ${data.requesterName} wants to join ${data.companyName}`;
}

export function getCompanyJoinRequestEmailHtml(
  data: CompanyJoinRequestEmailData,
): string {
  const { companyId } = data;
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
  <div style="background: #8b5cf6; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Team Member Request</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${companyAdminName}</strong>,</p>

    <p>Someone has requested to join your company on ${platformName}.</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #8b5cf6;">Requestor Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 120px;">Name:</td>
          <td style="padding: 8px 0;">${requesterName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${requesterEmail}" style="color: #8b5cf6;">${requesterEmail}</a></td>
        </tr>
        ${
          requesterJobTitle
            ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Job Title:</td>
          <td style="padding: 8px 0;">${requesterJobTitle}</td>
        </tr>
        `
            : ""
        }
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Company:</td>
          <td style="padding: 8px 0;">${companyName}</td>
        </tr>
      </table>
    </div>

    ${
      message
        ? `
    <div style="background: #f3f4f6; border-left: 4px solid #8b5cf6; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">Message from ${requesterName}:</p>
      <p style="margin: 10px 0 0 0; font-style: italic;">"${message}"</p>
    </div>
    `
        : ""
    }

    <div style="background: #ede9fe; border-left: 4px solid #8b5cf6; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>What happens next?</strong></p>
      <p style="margin: 10px 0 0 0;">If you approve this request, the platform administrator will also need to approve before the user gains access to your company.</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${membersUrl}" style="display: inline-block; background: #8b5cf6; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">Review Request</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. You're receiving this because you're an administrator of ${companyName}.
    </p>
  </div>
</body>
</html>
  `.trim();
}
