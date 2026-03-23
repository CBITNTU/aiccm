import { getPlatformName, getPlatformUrl } from "../index";
import { escapeHtml } from "../utils";

export interface VerificationReviewEmailData {
  userName: string;
  companyName: string;
  action: "approved" | "rejected" | "changes_requested";
  reviewNotes?: string;
  reviewFeedback?: {
    items: { section: string; label: string; status: string; notes: string }[];
    overallNotes: string;
  };
}

export function getVerificationReviewEmailSubject(
  data: VerificationReviewEmailData,
): string {
  const platformName = getPlatformName();
  const companyName = data.companyName;

  switch (data.action) {
    case "approved":
      return `Your company ${companyName} has been verified! - ${platformName}`;
    case "rejected":
      return `Verification update for ${companyName} - ${platformName}`;
    case "changes_requested":
      return `Action required: Changes needed for ${companyName} verification - ${platformName}`;
  }
}

export function getVerificationReviewEmailHtml(
  data: VerificationReviewEmailData,
): string {
  switch (data.action) {
    case "approved":
      return getApprovedHtml(data);
    case "rejected":
      return getRejectedHtml(data);
    case "changes_requested":
      return getChangesRequestedHtml(data);
  }
}

function getApprovedHtml(data: VerificationReviewEmailData): string {
  const platformName = getPlatformName();
  const dashboardUrl = getPlatformUrl("/dashboard");
  const userName = escapeHtml(data.userName);
  const companyName = escapeHtml(data.companyName);

  const notesBlock = data.reviewNotes
    ? `
    <div style="background: #EFF6FF; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">Reviewer Notes:</p>
      <p style="margin: 10px 0 0 0;">${escapeHtml(data.reviewNotes)}</p>
    </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Company Verified</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Company Verified!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Great news! Your company <strong>${companyName}</strong> has been verified on ${platformName}.</p>

    <p>Your verified status means:</p>
    <ul>
      <li>A verified badge is displayed on your company profile</li>
      <li>Enhanced trust and visibility across the platform</li>
      <li>Access to verified-only features and higher limits</li>
    </ul>

    ${notesBlock}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; text-decoration: none; padding: 14px 35px; border-radius: 5px; font-weight: bold; font-size: 16px;">Go to Dashboard</a>
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

function getRejectedHtml(data: VerificationReviewEmailData): string {
  const platformName = getPlatformName();
  const platformUrl = getPlatformUrl();
  const userName = escapeHtml(data.userName);
  const companyName = escapeHtml(data.companyName);

  const reasonBlock = data.reviewNotes
    ? `
    <div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">Reason:</p>
      <p style="margin: 10px 0 0 0;">${escapeHtml(data.reviewNotes)}</p>
    </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Request Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #6b7280; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Verification Request Update</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>Thank you for submitting a verification request for <strong>${companyName}</strong>. After reviewing your submission, we're unable to verify your company at this time.</p>

    ${reasonBlock}

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

function getChangesRequestedHtml(data: VerificationReviewEmailData): string {
  const platformName = getPlatformName();
  const dashboardUrl = getPlatformUrl("/dashboard");
  const userName = escapeHtml(data.userName);
  const companyName = escapeHtml(data.companyName);

  // Build feedback items list (only items that need changes)
  let feedbackBlock = "";
  if (data.reviewFeedback) {
    const changesNeeded = data.reviewFeedback.items?.filter(
      (item) => item.status === "needs_changes",
    );

    if (changesNeeded && changesNeeded.length > 0) {
      const itemsHtml = changesNeeded
        .map(
          (item) => `
        <li style="margin-bottom: 12px;">
          <strong>${escapeHtml(item.section)} — ${escapeHtml(item.label)}</strong>
          ${item.notes ? `<br><span style="color: #6b7280;">${escapeHtml(item.notes)}</span>` : ""}
        </li>`,
        )
        .join("");

      feedbackBlock += `
      <div style="background: #FFFBEB; border-left: 4px solid #D97706; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: bold;">Items requiring changes:</p>
        <ul style="margin: 0; padding-left: 20px;">
          ${itemsHtml}
        </ul>
      </div>`;
    }

    if (data.reviewFeedback.overallNotes) {
      feedbackBlock += `
      <div style="background: #FFFBEB; border-left: 4px solid #D97706; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; font-weight: bold;">Additional Notes:</p>
        <p style="margin: 10px 0 0 0;">${escapeHtml(data.reviewFeedback.overallNotes)}</p>
      </div>`;
    }
  }

  // Fallback to reviewNotes if no structured feedback
  if (!feedbackBlock && data.reviewNotes) {
    feedbackBlock = `
    <div style="background: #FFFBEB; border-left: 4px solid #D97706; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">Reviewer Notes:</p>
      <p style="margin: 10px 0 0 0;">${escapeHtml(data.reviewNotes)}</p>
    </div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changes Needed for Verification</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #D97706; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Changes Needed for Verification</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">Hello <strong>${userName}</strong>,</p>

    <p>We've reviewed the verification request for <strong>${companyName}</strong> and found some items that need to be updated before we can verify your company.</p>

    ${feedbackBlock}

    <p>Please update the requested items and resubmit your verification request.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: #D97706; color: white; text-decoration: none; padding: 14px 35px; border-radius: 5px; font-weight: bold; font-size: 16px;">Update Your Submission</a>
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
