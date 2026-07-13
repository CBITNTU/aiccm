import { getPlatformName, getPlatformUrl } from "../index";
import { escapeHtml } from "../utils";
import { type Locale } from "@/i18n/locales";
import { getEmailTranslator, strongTag } from "../i18n";

export interface ApprovalNotificationEmailData {
  userName: string;
  approved: boolean;
  rejectionReason?: string;
  signupType: "individual" | "new-company" | "join-company" | "invited";
  companyName?: string;
  locale: Locale;
}

export function getApprovalNotificationEmailSubject(
  data: ApprovalNotificationEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  const platformName = getPlatformName();
  return data.approved
    ? t("approval.subjectApproved", { platformName })
    : t("approval.subjectRejected", { platformName });
}

export function getApprovalNotificationEmailHtml(
  data: ApprovalNotificationEmailData,
): string {
  const { userName, approved, rejectionReason, signupType, companyName } = data;

  if (approved) {
    return getApprovedEmailHtml(
      data.locale,
      escapeHtml(userName),
      signupType,
      companyName != null ? escapeHtml(companyName) : undefined,
    );
  }
  return getRejectedEmailHtml(
    data.locale,
    escapeHtml(userName),
    rejectionReason != null ? escapeHtml(rejectionReason) : undefined,
  );
}

function getApprovedEmailHtml(
  locale: Locale,
  userName: string,
  signupType: string,
  companyName?: string,
): string {
  const t = getEmailTranslator(locale);
  const platformName = getPlatformName();
  const dashboardUrl = getPlatformUrl("/dashboard");

  const intro =
    signupType === "individual"
      ? t("approval.welcome.individual.intro", { platformName })
      : t.rich(`approval.welcome.${signupType}.intro`, {
          b: strongTag,
          companyName,
        });
  const items = (t.raw(`approval.welcome.${signupType}.items`) as string[])
    .map((item) => `          <li>${item}</li>`)
    .join("\n");
  const welcomeMessage = `
        <p>${intro}</p>
        <ul>
${items}
        </ul>
      `;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Approved</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">${t("approval.approvedHeading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t.rich("hello", { b: strongTag, name: userName })}</p>

    <p>${t("approval.approvedIntro", { platformName })}</p>

    ${welcomeMessage}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: white; text-decoration: none; padding: 14px 35px; border-radius: 5px; font-weight: bold; font-size: 16px;">${t("goToDashboard")}</a>
    </div>

    <div style="background: #EFF6FF; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>${t("approval.helpHeading")}</strong></p>
      <p style="margin: 10px 0 0 0;">${t("approval.helpBody")}</p>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("approval.footerApproved", { platformName })}
    </p>
  </div>
</body>
</html>
  `.trim();
}

function getRejectedEmailHtml(
  locale: Locale,
  userName: string,
  rejectionReason?: string,
): string {
  const t = getEmailTranslator(locale);
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
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("approval.rejectedHeading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t.rich("hello", { b: strongTag, name: userName })}</p>

    <p>${t("approval.rejectedIntro", { platformName })}</p>

    ${
      rejectionReason
        ? `
    <div style="background: #f3f4f6; border-left: 4px solid #6b7280; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold;">${t("labels.reason")}</p>
      <p style="margin: 10px 0 0 0;">${rejectionReason}</p>
    </div>
    `
        : ""
    }

    <p>${t("reconsider")}</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${platformUrl}" style="display: inline-block; background: #6b7280; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold;">${t("contactSupport")}</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("footer", { platformName })}
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
  locale: Locale;
}

export function getCompanyAdminApprovalEmailSubject(
  data: CompanyAdminApprovalEmailData,
): string {
  const t = getEmailTranslator(data.locale);
  return data.approvedByCompanyAdmin
    ? t("companyAdminApproval.subjectApproved", { companyName: data.companyName })
    : t("companyAdminApproval.subjectRejected", { companyName: data.companyName });
}

export function getCompanyAdminApprovalEmailHtml(
  data: CompanyAdminApprovalEmailData,
): string {
  const { approvedByCompanyAdmin, companyAdminName: _companyAdminName } = data;
  void _companyAdminName;
  const t = getEmailTranslator(data.locale);
  const userName = escapeHtml(data.userName);
  const companyName = escapeHtml(data.companyName);
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
  <div style="background: #2563EB; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("companyAdminApproval.approvedHeading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t.rich("hello", { b: strongTag, name: userName })}</p>

    <p>${t.rich("companyAdminApproval.approvedIntro", { b: strongTag, companyName })}</p>

    <div style="background: #DBEAFE; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0;">
      <p style="margin: 0;"><strong>${t("companyAdminApproval.nextStepHeading")}</strong></p>
      <p style="margin: 10px 0 0 0;">${t("companyAdminApproval.nextStepBody", { platformName })}</p>
    </div>

    <p>${t("companyAdminApproval.thanks")}</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("footer", { platformName })}
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
    <h1 style="color: white; margin: 0; font-size: 24px;">${t("companyAdminApproval.rejectedHeading")}</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px;">${t.rich("hello", { b: strongTag, name: userName })}</p>

    <p>${t.rich("companyAdminApproval.rejectedIntro", { b: strongTag, companyName })}</p>

    <p>${t("companyAdminApproval.stillCan", { platformName })}</p>
    <ul>
${(t.raw("companyAdminApproval.stillCanItems") as string[]).map((item) => `      <li>${item}</li>`).join("\n")}
    </ul>

    <p>${t("companyAdminApproval.questions")}</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; margin: 0;">
      ${t("footer", { platformName })}
    </p>
  </div>
</body>
</html>
  `.trim();
}
