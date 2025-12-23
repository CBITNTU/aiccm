import { getPlatformName, getPlatformUrl } from "../index";

export interface WelcomeEmailData {
  userName: string;
  signupType: "individual" | "new-company" | "join-company";
  companyName?: string;
}

export function getWelcomeEmailSubject(): string {
  return `Welcome to ${getPlatformName()}`;
}

export function getWelcomeEmailHtml(data: WelcomeEmailData): string {
  const { userName, signupType, companyName } = data;
  const platformName = getPlatformName();
  const platformUrl = getPlatformUrl();

  let signupTypeMessage = "";
  switch (signupType) {
    case "individual":
      signupTypeMessage = `
        <p>You've signed up as an <strong>individual user</strong>. You can browse tenders, explore the company directory, and access platform features.</p>
        <p>If you'd like to associate with a company later, you can do so from your profile settings.</p>
      `;
      break;
    case "new-company":
      signupTypeMessage = `
        <p>You've registered a new company: <strong>${companyName}</strong>. Once approved, you'll be the company administrator with full access to manage your company profile and invite team members.</p>
      `;
      break;
    case "join-company":
      signupTypeMessage = `
        <p>You've requested to join <strong>${companyName}</strong>. Your request will be reviewed by the company administrator and our platform team.</p>
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

    <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>What's Next?</strong></p>
      <p style="margin: 10px 0 0 0;">Your account is currently pending approval. Our team will review your registration and you'll receive an email once your account is approved.</p>
    </div>

    <p>In the meantime, feel free to explore our platform:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${platformUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">Visit ${platformName}</a>
    </div>

    <p style="color: #666; font-size: 14px;">If you have any questions, please don't hesitate to reach out to our support team.</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. If you didn't sign up for an account, please ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}
