import { getPlatformName, getPlatformUrl } from "../index";
import { escapeHtml } from "../utils";

export interface AdminNotificationEmailData {
  userName: string;
  userEmail: string;
  signupType: "individual" | "new-company" | "join-company" | "invited";
  companyName?: string;
  jobTitle?: string;
}

export function getAdminNotificationEmailSubject(
  data: AdminNotificationEmailData,
): string {
  const typeLabel =
    data.signupType === "individual"
      ? "Individual"
      : data.signupType === "new-company"
        ? "Company"
        : data.signupType === "invited"
          ? "Team Invitation"
          : "Company Join Request";
  return `[Action Required] New ${typeLabel} Signup: ${data.userName}`;
}

export function getAdminNotificationEmailHtml(
  data: AdminNotificationEmailData,
): string {
  const { signupType } = data;
  const userName = escapeHtml(data.userName);
  const userEmail = escapeHtml(data.userEmail);
  const companyName = data.companyName ? escapeHtml(data.companyName) : undefined;
  const jobTitle = data.jobTitle ? escapeHtml(data.jobTitle) : undefined;
  const platformName = getPlatformName();
  const adminUrl = getPlatformUrl("/admin");
  // Link directly to approvals section for new company signups
  const approvalsUrl =
    signupType === "new-company"
      ? getPlatformUrl("/admin?tab=approvals")
      : adminUrl;

  const signupTypeLabel =
    signupType === "individual"
      ? "Individual User"
      : signupType === "new-company"
        ? "New Company Registration"
        : signupType === "invited"
          ? "Team Invitation"
          : "Company Join Request";

  const signupTypeBadgeColor =
    signupType === "individual"
      ? "#3b82f6"
      : signupType === "new-company"
        ? "#10b981"
        : signupType === "invited"
          ? "#f59e0b"
          : "#8b5cf6";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Signup Requires Approval</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc2626; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Signup Requires Approval</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p>A new user has signed up for ${platformName} and requires your approval.</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 140px;">Type:</td>
          <td style="padding: 8px 0;">
            <span style="background: ${signupTypeBadgeColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">${signupTypeLabel}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Name:</td>
          <td style="padding: 8px 0;">${userName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${userEmail}" style="color: #667eea;">${userEmail}</a></td>
        </tr>
        ${
          jobTitle
            ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Job Title:</td>
          <td style="padding: 8px 0;">${jobTitle}</td>
        </tr>
        `
            : ""
        }
        ${
          companyName
            ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Company:</td>
          <td style="padding: 8px 0;">${companyName}</td>
        </tr>
        `
            : ""
        }
      </table>
    </div>

    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Action Required</strong></p>
      <p style="margin: 10px 0 0 0;">Please review this signup request and approve or reject it from the admin panel.</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${approvalsUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">Review in Admin Panel</a>
    </div>
    ${
      signupType === "new-company"
        ? `<p style="text-align: center; color: #666; font-size: 14px; margin-top: 10px;">Direct link: <a href="${approvalsUrl}" style="color: #667eea;">${approvalsUrl}</a></p>`
        : ""
    }

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This is an automated notification from ${platformName}. You're receiving this because you're a platform administrator.
    </p>
  </div>
</body>
</html>
  `.trim();
}
