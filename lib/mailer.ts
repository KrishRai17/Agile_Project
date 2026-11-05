/**
 * University email delivery service.
 * Supports Resend API, outbound webhook, or console preview in development/test.
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  success: boolean;
  provider: "resend" | "webhook" | "console";
  id?: string;
  error?: string;
}

let hasLoggedMissingProvider = false;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getAppBaseUrl(): string {
  const envUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl?.trim()) return envUrl.trim().replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
    throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is required in production");
  }
  return "http://localhost:3000";
}

export async function sendEmail(options: SendEmailOptions): Promise<SendResult> {
  // 1. Resend API provider
  if (process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production" && !process.env.EMAIL_FROM?.trim()) {
      return {
        success: false,
        provider: "resend",
        error: "EMAIL_FROM is required in production when using Resend",
      };
    }
    const from = process.env.EMAIL_FROM?.trim() || "HopOn Campus <verify@hopon.demo>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        },
        body: JSON.stringify({
          from,
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Resend delivery failed:", errorData);
        return {
          success: false,
          provider: "resend",
          error: (errorData as { message?: string }).message || `Resend HTTP ${res.status}`,
        };
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { success: true, provider: "resend", id: data.id };
    } catch (err) {
      console.error("Resend network error:", err);
      return { success: false, provider: "resend", error: String(err) };
    }
  }

  // 2. Custom Webhook provider
  if (process.env.EMAIL_WEBHOOK_URL) {
    const from = process.env.EMAIL_FROM?.trim() || "HopOn Campus <verify@hopon.demo>";
    try {
      const res = await fetch(process.env.EMAIL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
          sentAt: Date.now(),
        }),
      });
      if (!res.ok) {
        return { success: false, provider: "webhook", error: `Webhook HTTP ${res.status}` };
      }
      return { success: true, provider: "webhook" };
    } catch (err) {
      return { success: false, provider: "webhook", error: String(err) };
    }
  }

  // In production: if neither RESEND_API_KEY nor EMAIL_WEBHOOK_URL is set, fail closed!
  if (process.env.NODE_ENV === "production") {
    if (!hasLoggedMissingProvider) {
      hasLoggedMissingProvider = true;
      console.error(
        "[HopOn Mailer] Email provider not configured: neither RESEND_API_KEY nor EMAIL_WEBHOOK_URL is set in production."
      );
    }
    return { success: false, provider: "console", error: "Email delivery is not configured" };
  }

  // 3. Fallback: Console logger for dev/test (log notice only once per process)
  if (!hasLoggedMissingProvider) {
    hasLoggedMissingProvider = true;
    console.log("[HopOn Mailer] Email provider not configured; previewing verification emails in console.");
  }
  console.log(
    `[HopOn Email Mock] To: ${options.to}\nSubject: ${options.subject}\nText:\n${options.text}\n---------------------------`
  );
  return { success: true, provider: "console" };
}

/**
 * Sends a one-time verification link to a student's university email address.
 */
export async function sendVerificationEmail(
  toEmail: string,
  token: string,
  userName?: string
): Promise<SendResult> {
  let baseUrl: string;
  try {
    baseUrl = getAppBaseUrl();
  } catch (err) {
    return { success: false, provider: "console", error: String(err) };
  }

  const encodedToken = encodeURIComponent(token);
  const verifyUrl = `${baseUrl}/verify?token=${encodedToken}`;
  const safeVerifyUrl = escapeHtml(verifyUrl);

  const rawGreeting = userName ? `Hi ${userName},` : "Hello,";
  const safeGreeting = userName ? `Hi ${escapeHtml(userName)},` : "Hello,";

  const text = `${rawGreeting}\n\nWelcome to HopOn Campus Rides! Please verify your student email address to unlock rides, vehicle posting, and student wallet features.\n\nVerify your account:\n${verifyUrl}\n\nThis verification link expires in 24 hours.\nIf you didn't create a HopOn account, you can safely ignore this email.\n`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify your HopOn Student Account</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="width: 36px; height: 36px; background: #27a8f5; border-radius: 10px; display: inline-block; vertical-align: middle; text-align: center; line-height: 36px; color: #ffffff; font-weight: 900; font-size: 18px;">H</div>
            <span style="font-size: 20px; font-weight: 800; color: #0f172a; margin-left: 10px; vertical-align: middle;">HopOn Campus</span>
          </div>
          <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0;">Verify your student account</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">${safeGreeting}</p>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">Welcome to HopOn! Click the button below to verify your university email and activate your campus carpooling access.</p>
          <div style="margin: 28px 0; text-align: center;">
            <a href="${safeVerifyUrl}" style="background-color: #27a8f5; color: #ffffff; padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: 14px; text-decoration: none; display: inline-block;">Verify Student Email</a>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #64748b;">Or paste this link into your browser:<br><a href="${safeVerifyUrl}" style="color: #27a8f5; word-break: break-all;">${safeVerifyUrl}</a></p>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">
            This link is valid for 24 hours. For campus security, do not forward this email.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: toEmail,
    subject: "Verify your HopOn Student Account",
    text,
    html,
  });
}
