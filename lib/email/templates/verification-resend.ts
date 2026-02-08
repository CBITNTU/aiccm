import { getPlatformName } from "../index";

export interface VerificationResendEmailData {
  userName: string;
  verificationLink: string;
}

export function getVerificationResendEmailSubject(): string {
  return `Verify your email address - ${getPlatformName()}`;
}

export function getVerificationResendEmailHtml(
  data: VerificationResendEmailData,
): string {
  const { userName, verificationLink } = data;
  const platformName = getPlatformName();

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
    <h1 style="color: white; margin: 0; font-size: 24px;">Verify Your Email Address</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>You requested a new verification email. Click the button below to verify your email address.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 14px 35px; border-radius: 6px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
    </div>

    <p style="font-size: 12px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${verificationLink}" style="color: #3b82f6; word-break: break-all;">${verificationLink}</a></p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. If you didn't request this, please ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}
