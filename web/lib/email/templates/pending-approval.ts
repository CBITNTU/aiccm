import { getPlatformName, getPlatformUrl } from "../index";

export interface PendingApprovalEmailData {
  userName: string;
  signupType: "individual" | "new-company" | "join-company";
  companyName?: string;
}

export function getPendingApprovalEmailSubject(): string {
  return `Your ${getPlatformName()} Account is Pending Approval`;
}

export function getPendingApprovalEmailHtml(
  data: PendingApprovalEmailData
): string {
  const { userName, signupType, companyName } = data;
  const platformName = getPlatformName();
  const platformUrl = getPlatformUrl();

  let approvalMessage = "";
  switch (signupType) {
    case "individual":
      approvalMessage = `
        <p>Your individual account registration is being reviewed by our platform administrators.</p>
        <p>Once approved, you'll have full access to browse tenders, explore companies, and use all platform features.</p>
      `;
      break;
    case "new-company":
      approvalMessage = `
        <p>Your company registration for <strong>${companyName}</strong> is being reviewed.</p>
        <p>Once approved, you'll be the company administrator with the ability to:</p>
        <ul>
          <li>Manage your company profile</li>
          <li>Invite team members</li>
          <li>View matching tenders</li>
          <li>Participate in virtual organizations</li>
        </ul>
      `;
      break;
    case "join-company":
      approvalMessage = `
        <p>Your request to join <strong>${companyName}</strong> requires two approvals:</p>
        <ol>
          <li><strong>Company Administrator</strong> - The admin of ${companyName} will review your request</li>
          <li><strong>Platform Administrator</strong> - Our team will verify your registration</li>
        </ol>
        <p>You'll be notified as each approval step is completed.</p>
      `;
      break;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Pending Approval</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f59e0b; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Account Pending Approval</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Thank you for registering with ${platformName}. Your account is currently pending approval.</p>

    ${approvalMessage}

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Approval Timeline</strong></p>
      <p style="margin: 10px 0 0 0;">Most accounts are reviewed within 24-48 hours. You'll receive an email notification once your account status changes.</p>
    </div>

    <p>While you wait, you can:</p>
    <ul>
      <li>Prepare any additional information about your company</li>
      <li>Review our platform guidelines</li>
      <li>Reach out to our support team if you have questions</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${platformUrl}" style="display: inline-block; background: #f59e0b; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">Visit ${platformName}</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. If you didn't sign up for an account, please ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}
