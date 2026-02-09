import { getPlatformName, getPlatformUrl } from "../index";
import { escapeHtml } from "../utils";

export interface ApprovalNotificationEmailData {
  userName: string;
  approved: boolean;
  rejectionReason?: string;
  signupType: "individual" | "new-company" | "join-company" | "invited";
  companyName?: string;
}

export function getApprovalNotificationEmailSubject(
  data: ApprovalNotificationEmailData,
): string {
  const platformName = getPlatformName();
  if (data.approved) {
    return `Your ${platformName} Account Has Been Approved!`;
  }
  return `Update on Your ${platformName} Account Application`;
}

export function getApprovalNotificationEmailHtml(
  data: ApprovalNotificationEmailData,
): string {
  const { userName, approved, rejectionReason, signupType, companyName } = data;
  const _platformName = getPlatformName();
  const _dashboardUrl = getPlatformUrl("/dashboard");

  if (approved) {
    return getApprovedEmailHtml(
      escapeHtml(userName),
      signupType,
      companyName != null ? escapeHtml(companyName) : undefined,
    );
  }
  return getRejectedEmailHtml(
    escapeHtml(userName),
    rejectionReason != null ? escapeHtml(rejectionReason) : undefined,
  );
}

function getApprovedEmailHtml(
  userName: string,
  signupType: string,
  companyName?: string,
): string {
  const platformName = getPlatformName();
  const dashboardUrl = getPlatformUrl("/dashboard");

  let welcomeMessage = "";
  switch (signupType) {
    case "individual":
      welcomeMessage = `
        <p>You now have full access to ${platformName} as an individual user. You can:</p>
        <ul>
          <li>Browse available tenders</li>
          <li>Explore the company directory</li>
          <li>Connect with potential partners</li>
          <li>Join a company at any time from your profile</li>
        </ul>
      `;
      break;
    case "new-company":
      welcomeMessage = `
        <p>Your company <strong>${companyName}</strong> has been approved! As the company administrator, you can:</p>
        <ul>
          <li>Complete your company profile</li>
          <li>Invite team members</li>
          <li>View matching tenders</li>
          <li>Participate in virtual organizations</li>
          <li>Manage company settings</li>
        </ul>
      `;
      break;
    case "join-company":
      welcomeMessage = `
        <p>You've been approved to join <strong>${companyName}</strong>! You now have access to:</p>
        <ul>
          <li>Your company's profile and details</li>
          <li>Company tender matches</li>
          <li>Team collaboration features</li>
          <li>Virtual organization projects</li>
        </ul>
      `;
      break;
    case "invited":
      welcomeMessage = `
        <p>You've been approved to join <strong>${companyName}</strong> as a team member! You now have access to:</p>
        <ul>
          <li>Your company's profile and details</li>
          <li>Company tender matches</li>
          <li>Team collaboration features</li>
          <li>Virtual organization projects</li>
        </ul>
      `;
      break;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Approved</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Account Approved!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Great news! Your ${platformName} account has been approved.</p>

    ${welcomeMessage}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 14px 35px; border-radius: 5px; font-weight: bold; font-size: 16px;">Go to Dashboard</a>
    </div>

    <div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Need Help Getting Started?</strong></p>
      <p style="margin: 10px 0 0 0;">Check out our platform guide or reach out to our support team if you have any questions.</p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. Welcome aboard!
    </p>
  </div>
</body>
</html>
  `.trim();
}

function getRejectedEmailHtml(
  userName: string,
  rejectionReason?: string,
): string {
  const platformName = getPlatformName();
  const platformUrl = getPlatformUrl();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Application Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #6b7280; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Account Application Update</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Thank you for your interest in ${platformName}. After reviewing your application, we're unable to approve your account at this time.</p>

    ${
      rejectionReason
        ? `
    <div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">Reason:</p>
      <p style="margin: 10px 0 0 0;">${rejectionReason}</p>
    </div>
    `
        : ""
    }

    <p>If you believe this decision was made in error, or if you have additional information that might help us reconsider, please contact our support team.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${platformUrl}" style="display: inline-block; background: #6b7280; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">Contact Support</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}.
    </p>
  </div>
</body>
</html>
  `.trim();
}

// Export additional helper for sending approval emails
export interface CompanyAdminApprovalEmailData {
  userName: string;
  companyName: string;
  approvedByCompanyAdmin: boolean;
  companyAdminName?: string;
}

export function getCompanyAdminApprovalEmailSubject(
  data: CompanyAdminApprovalEmailData,
): string {
  if (data.approvedByCompanyAdmin) {
    return `${data.companyName} has approved your join request - Pending platform approval`;
  }
  return `Your request to join ${data.companyName} was not approved`;
}

export function getCompanyAdminApprovalEmailHtml(
  data: CompanyAdminApprovalEmailData,
): string {
  const { userName, companyName, approvedByCompanyAdmin, companyAdminName: _companyAdminName } =
    data;
  void _companyAdminName;
  const platformName = getPlatformName();

  if (approvedByCompanyAdmin) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Company Approval Received</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #3b82f6; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Company Approval Received!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Good news! <strong>${companyName}</strong> has approved your request to join their team.</p>

    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Next Step</strong></p>
      <p style="margin: 10px 0 0 0;">Your request is now pending final approval from the ${platformName} team. You'll receive another email once this is complete.</p>
    </div>

    <p>Thank you for your patience!</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join Request Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #6b7280; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Join Request Update</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Unfortunately, your request to join <strong>${companyName}</strong> was not approved by their administrator.</p>

    <p>This doesn't affect your ${platformName} account. You can still:</p>
    <ul>
      <li>Browse the platform as an individual user</li>
      <li>Request to join a different company</li>
      <li>Register your own company</li>
    </ul>

    <p>If you have questions, please contact our support team.</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}.
    </p>
  </div>
</body>
</html>
  `.trim();
}
