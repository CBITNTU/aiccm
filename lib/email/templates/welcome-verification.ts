import { getPlatformName, getPlatformUrl } from "../index";

export interface WelcomeVerificationEmailData {
  userName: string;
  signupType: "individual" | "new-company" | "join-company";
  companyName?: string;
  verificationLink: string;
}

export function getWelcomeVerificationEmailSubject(): string {
  return `Welcome to ${getPlatformName()} - Please Verify Your Email`;
}

export function getWelcomeVerificationEmailHtml(
  data: WelcomeVerificationEmailData,
): string {
  const { userName, signupType, companyName, verificationLink } = data;
  const platformName = getPlatformName();
  const platformUrl = getPlatformUrl();

  let signupTypeMessage = "";
  let approvalMessage = "";

  switch (signupType) {
    case "individual":
      signupTypeMessage = `
        <p>You've signed up as an <strong>individual user</strong>. Once approved, you can browse tenders, explore the company directory, and access platform features.</p>
      `;
      approvalMessage = `
        <p>Your individual account registration is being reviewed by our platform administrators.</p>
      `;
      break;
    case "new-company":
      signupTypeMessage = `
        <p>You've registered a new company: <strong>${companyName}</strong>. Once approved, you'll be the company administrator with full access to manage your company profile and invite team members.</p>
      `;
      approvalMessage = `
        <p>Your company registration for <strong>${companyName}</strong> is being reviewed. Once approved, you'll be able to:</p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Manage your company profile</li>
          <li>Invite team members</li>
          <li>View matching tenders</li>
          <li>Participate in virtual organizations</li>
        </ul>
      `;
      break;
    case "join-company":
      signupTypeMessage = `
        <p>You've requested to join <strong>${companyName}</strong>. Your request will be reviewed by the company administrator and our platform team.</p>
      `;
      approvalMessage = `
        <p>Your request to join <strong>${companyName}</strong> requires two approvals:</p>
        <ol style="margin: 10px 0; padding-left: 20px;">
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
  <title>Welcome to ${platformName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ${platformName}!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Thank you for signing up for ${platformName}! We're excited to have you on board.</p>

    ${signupTypeMessage}

    <!-- Email Verification Section -->
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <p style="margin: 0 0 15px 0; font-weight: bold; color: #1e40af;">Please verify your email address</p>
      <p style="margin: 0 0 20px 0; color: #1e40af;">Click the button below to verify your email and activate your account.</p>
      <div style="text-align: center;">
        <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 14px 35px; border-radius: 6px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
      </div>
      <p style="margin: 20px 0 0 0; font-size: 12px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${verificationLink}" style="color: #3b82f6; word-break: break-all;">${verificationLink}</a></p>
    </div>

    <!-- Pending Approval Section -->
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0;">
      <p style="margin: 0; font-weight: bold; color: #92400e;">Account Pending Approval</p>
      <div style="margin-top: 10px; color: #92400e;">
        ${approvalMessage}
      </div>
      <p style="margin: 15px 0 0 0; padding: 10px; background: #fef9c3; border-radius: 4px; font-size: 14px;">
        <strong>Approval Timeline:</strong> Most accounts are reviewed within 24-48 hours. You'll receive an email once your account is approved.
      </p>
    </div>

    <!-- What Happens Next -->
    <div style="margin: 25px 0;">
      <p style="font-weight: bold; margin-bottom: 10px;">What happens next:</p>
      <ol style="margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;"><strong>Verify your email</strong> - Click the button above</li>
        <li style="margin-bottom: 8px;"><strong>Wait for approval</strong> - Our team will review your registration</li>
        <li style="margin-bottom: 8px;"><strong>Get started</strong> - Once approved, you'll have full access to the platform</li>
      </ol>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${platformUrl}" style="display: inline-block; background: #e5e7eb; color: #374151; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">Visit ${platformName}</a>
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
