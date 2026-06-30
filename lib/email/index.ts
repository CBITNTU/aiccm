import { Resend } from "resend";
import { getActiveProfile } from "@/lib/deployment";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Platform configuration. Read lazily so the active deployment profile is available
// as a fallback. Env vars keep precedence so existing deployments are unaffected.
function platformName(): string {
  return process.env.PLATFORM_NAME || getActiveProfile().brand.name;
}
function platformEmailFrom(): string {
  // Fall back to the active deployment's support email so a whitelabel/region deploy
  // that omits PLATFORM_EMAIL_FROM still sends from its own (Resend-verified) domain
  // instead of the hardcoded tndrx.com sender. PLATFORM_EMAIL_FROM keeps precedence.
  return (
    process.env.PLATFORM_EMAIL_FROM ||
    getActiveProfile().brand.supportEmail ||
    "noreply@contact.tndrx.com"
  );
}
function platformUrl(): string {
  return (
    process.env.PLATFORM_URL ||
    getActiveProfile().brand.supportUrl ||
    "http://localhost:3000"
  );
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  data?: { id: string };
  error?: unknown;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const { to, subject, html, text } = options;

  // In development mode, log email instead of sending via Resend
  if (process.env.NODE_ENV === "development") {
    const recipients = Array.isArray(to) ? to.join(", ") : to;

    // Extract any URLs from the HTML for easy access
    const urlMatches = html.match(/href="([^"]+)"/g);
    const urls = urlMatches
      ? urlMatches.map((m) => m.replace(/href="|"/g, ""))
      : [];

    console.log("\n========== EMAIL (DEV MODE) ==========");
    console.log("To:", recipients);
    console.log("Subject:", subject);
    if (urls.length > 0) {
      console.log("Links:");
      urls.forEach((url) => console.log("  →", url));
    }
    console.log("=======================================\n");

    return { success: true, data: { id: `dev-${Date.now()}` } };
  }

  // Check if API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email send");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const result = await resend.emails.send({
      from: `${platformName()} <${platformEmailFrom()}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || stripHtml(html),
    });

    if (result.error) {
      console.error("Email send error:", result.error);
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data ?? undefined };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Get platform URL for email links
 */
export function getPlatformUrl(path: string = ""): string {
  return `${platformUrl()}${path}`;
}

/**
 * Get platform name for email content
 */
export function getPlatformName(): string {
  return platformName();
}

// Re-export templates
export * from "./templates/welcome-verification";
export * from "./templates/verification-resend";
export * from "./templates/signup-verification";
export * from "./templates/admin-notification";
export * from "./templates/company-join-request";
export * from "./templates/approval-notification";
export * from "./templates/team-invitation";
export * from "./templates/project-invitation";
export * from "./templates/verification-review";
