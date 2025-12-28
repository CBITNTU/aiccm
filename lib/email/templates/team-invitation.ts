import { getPlatformName } from "../index";

export interface TeamInvitationEmailData {
  inviteeEmail: string;
  inviterName: string;
  companyName: string;
  inviteLink: string;
  expiresAt: Date;
}

export function getTeamInvitationEmailSubject(
  data: TeamInvitationEmailData
): string {
  return `You've been invited to join ${data.companyName} on ${getPlatformName()}`;
}

export function getTeamInvitationEmailHtml(
  data: TeamInvitationEmailData
): string {
  const { inviterName, companyName, inviteLink, expiresAt } = data;
  const platformName = getPlatformName();

  // Format expiry date
  const expiryFormatted = expiresAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello,</p>

    <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on ${platformName}.</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #8b5cf6;">What is ${platformName}?</h3>
      <p style="margin: 0;">
        ${platformName} is a construction and consulting tender matching platform that helps companies
        find and win relevant contracts. As a team member, you'll be able to:
      </p>
      <ul style="margin: 10px 0; padding-left: 20px;">
        <li>View and match with tender opportunities</li>
        <li>Access company profile and capabilities</li>
        <li>Collaborate with your team on bids</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">Accept Invitation</a>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #92400e;">This invitation expires on ${expiryFormatted}</p>
      <p style="margin: 5px 0 0 0; color: #92400e; font-size: 14px;">
        Please accept the invitation before it expires. If you need a new invitation,
        please contact ${inviterName}.
      </p>
    </div>

    <p style="color: #666; font-size: 14px;">
      If you didn't expect this invitation or don't want to join, you can safely ignore this email.
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      This email was sent by ${platformName}. If the button above doesn't work,
      copy and paste this link into your browser:
    </p>
    <p style="color: #8b5cf6; font-size: 12px; word-break: break-all;">
      ${inviteLink}
    </p>
  </div>
</body>
</html>
  `.trim();
}
