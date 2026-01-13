import { getPlatformName, getPlatformUrl } from "../index";

export interface SignupVerificationEmailData {
  verificationLink: string;
}

export function getSignupVerificationEmailSubject(): string {
  return `Verify your email to get started - ${getPlatformName()}`;
}

export function getSignupVerificationEmailHtml(
  data: SignupVerificationEmailData
): string {
  const { verificationLink } = data;
  const platformName = getPlatformName();
  const platformUrl = getPlatformUrl();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ${platformName}!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Thanks for signing up!</p>

    <p>To get started, please verify your email address by clicking the button below:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 14px 35px; border-radius: 6px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
    </div>

    <p>Once verified, you'll be able to complete your profile setup and start exploring tenders.</p>

    <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
      <p style="margin: 0; font-size: 14px;"><strong>What happens next?</strong></p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 14px; color: #6b7280;">
        <li>Complete your profile information</li>
        <li>Choose whether to sign up as an individual or business</li>
        <li>If registering a company, provide basic details</li>
        <li>Your account will be reviewed by our team</li>
      </ul>
    </div>

    <p style="font-size: 12px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${verificationLink}" style="color: #3b82f6; word-break: break-all;">${verificationLink}</a></p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by <a href="${platformUrl}" style="color: #3b82f6;">${platformName}</a>. If you didn't create an account, please ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}
