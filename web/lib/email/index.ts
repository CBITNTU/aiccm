import { Resend } from "resend";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Platform configuration
const PLATFORM_NAME = process.env.PLATFORM_NAME || "AICCM Platform";
const PLATFORM_EMAIL_FROM =
  process.env.PLATFORM_EMAIL_FROM || "noreply@aiccm.com";
const PLATFORM_URL = process.env.PLATFORM_URL || "http://localhost:3000";

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
  options: SendEmailOptions
): Promise<SendEmailResult> {
  const { to, subject, html, text } = options;

  // Check if API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email send");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const result = await resend.emails.send({
      from: `${PLATFORM_NAME} <${PLATFORM_EMAIL_FROM}>`,
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
  return `${PLATFORM_URL}${path}`;
}

/**
 * Get platform name for email content
 */
export function getPlatformName(): string {
  return PLATFORM_NAME;
}

// Re-export templates
export * from "./templates/welcome-verification";
export * from "./templates/verification-resend";
export * from "./templates/admin-notification";
export * from "./templates/company-join-request";
export * from "./templates/approval-notification";
