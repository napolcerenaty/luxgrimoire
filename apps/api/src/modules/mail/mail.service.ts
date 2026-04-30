import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;
  private readonly brevo: BrevoClient | null = null;
  private readonly brevoFrom: { name: string; email: string };

  constructor() {
    // Nodemailer SMTP — fallback when Brevo template IDs are not configured
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.brevo.com',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Brevo API client — preferred delivery for all emails
    if (process.env.BREVO_API_KEY) {
      this.brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    }

    const fromRaw = process.env.SMTP_FROM ?? '"LuxGrimoire" <noreply@luxgrimoire.com>';
    const match = fromRaw.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
    this.brevoFrom = match
      ? { name: match[1].trim(), email: match[2].trim() }
      : { name: 'LuxGrimoire', email: fromRaw };
  }

  /**
   * Welcome email — Brevo template.
   * Env: BREVO_WELCOME_TEMPLATE_ID
   * Template params: {{ params.username }}, {{ params.appUrl }}
   */
  async sendWelcomeEmail(to: string, username: string): Promise<void> {
    const appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    await this.sendViaBrevoTemplate(
      'BREVO_WELCOME_TEMPLATE_ID',
      to,
      { username, appUrl },
      'Welcome email',
    );
  }

  /**
   * Email verification — Brevo template (preferred) or SMTP fallback.
   * Env: BREVO_VERIFY_TEMPLATE_ID
   * Template params: {{ params.verifyLink }}
   * Fallback subject: "Verify your LuxGrimoire email address"
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const verifyLink = `${frontendUrl}/verify-email?token=${token}`;

    const sent = await this.sendViaBrevoTemplate(
      'BREVO_VERIFY_TEMPLATE_ID',
      to,
      { verifyLink },
      'Verification email',
    );

    if (!sent) {
      // Fallback: send via SMTP with inline HTML
      const year = new Date().getFullYear();
      const html = emailShell('Verify your email – LuxGrimoire', `
        ${emailBrand()}
        ${emailTitle('Confirm Your Email Address')}
        <tr><td style="padding:16px 44px 0 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:17px;line-height:1.75;">
            Thank you for creating a LuxGrimoire account. Please confirm your email address to activate your account.
          </p>
        </td></tr>
        ${emailButton(verifyLink, 'Verify Email Address')}
        <tr><td style="padding:0 44px 8px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:15px;line-height:1.6;">
            This link expires in <span style="color:#c0e4f4;font-weight:600;">24 hours</span>.
          </p>
        </td></tr>
        <tr><td style="padding:0 44px 36px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#4a88a8;font-size:14px;line-height:1.6;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </td></tr>
        ${emailFooter(year)}
      `);
      await this.sendViaSMTP(to, 'Verify your LuxGrimoire email address', html, 'Verification email');
    }
  }

  /**
   * Password reset — Brevo template (preferred) or SMTP fallback.
   * Env: BREVO_RESET_TEMPLATE_ID
   * Template params: {{ params.resetLink }}
   * Fallback subject: "Reset your LuxGrimoire password"
   */
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;

    const sent = await this.sendViaBrevoTemplate(
      'BREVO_RESET_TEMPLATE_ID',
      to,
      { resetLink },
      'Password reset email',
    );

    if (!sent) {
      const year = new Date().getFullYear();
      const html = emailShell('Reset your password – LuxGrimoire', `
        ${emailBrand()}
        ${emailTitle('Reset Your Password')}
        <tr><td style="padding:16px 44px 0 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:17px;line-height:1.75;">
            We received a request to reset the password for your LuxGrimoire account.
          </p>
        </td></tr>
        ${emailButton(resetLink, 'Reset Password')}
        <tr><td style="padding:0 44px 8px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:15px;line-height:1.6;">
            This link expires in <span style="color:#c0e4f4;font-weight:600;">1 hour</span>.
          </p>
        </td></tr>
        <tr><td style="padding:0 44px 36px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#4a88a8;font-size:14px;line-height:1.6;">
            If you didn't request this, you can safely ignore this email. Your password will not change.
          </p>
        </td></tr>
        ${emailFooter(year)}
      `);
      await this.sendViaSMTP(to, 'Reset your LuxGrimoire password', html, 'Password reset email');
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Send via Brevo template API. Returns true on success, false if not configured or failed.
   */
  private async sendViaBrevoTemplate(
    envKey: string,
    to: string,
    params: Record<string, string>,
    label: string,
  ): Promise<boolean> {
    const templateId = parseInt(process.env[envKey] ?? '0', 10);
    if (!templateId || !this.brevo) return false;

    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        templateId,
        to: [{ email: to }],
        params,
        sender: this.brevoFrom,
      });
      this.logger.log(`${label} sent via Brevo template ${templateId}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send ${label} via Brevo`, err);
      return false;
    }
  }

  private async sendViaSMTP(to: string, subject: string, html: string, label: string): Promise<void> {
    const from = process.env.SMTP_FROM ?? '"LuxGrimoire" <noreply@luxgrimoire.com>';
    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`${label} sent via SMTP`);
    } catch (err) {
      this.logger.error(`Failed to send ${label} via SMTP`, err);
    }
  }
}

// ── Shared email template helpers ─────────────────────────────────────────────

function emailShell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#020610;font-family:'Crimson Text',Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#020610;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:580px;width:100%;background-color:#070f1c;border:1px solid #183858;border-radius:12px;overflow:hidden;">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailBrand(): string {
  return `
  <tr>
    <td style="height:3px;background:linear-gradient(to right,#060d18,#0d1f35,#2a9ec4,#0d1f35,#060d18);"></td>
  </tr>
  <tr>
    <td style="padding:36px 44px 0 44px;text-align:center;">
      <p style="margin:0;font-family:'Crimson Text',Georgia,serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#4a88a8;font-weight:600;">
        — The Luxury Book Collector's Platform —
      </p>
      <p style="margin:10px 0 0 0;font-family:'Cinzel',Georgia,serif;font-size:28px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c0e4f4;">
        LuxGrimoire
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 44px 0 44px;text-align:center;">
      <p style="margin:0;color:#183858;font-size:16px;letter-spacing:0.25em;">· · · · ·</p>
    </td>
  </tr>`;
}

function emailTitle(text: string): string {
  return `
  <tr>
    <td style="padding:20px 44px 0 44px;text-align:center;">
      <h1 style="margin:0;font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:600;letter-spacing:0.06em;color:#e8f4ff;line-height:1.35;">
        ${text}
      </h1>
    </td>
  </tr>`;
}

function emailButton(href: string, label: string): string {
  return `
  <tr>
    <td style="padding:32px 44px 28px 44px;text-align:center;">
      <a href="${href}"
         style="display:inline-block;background-color:#1a82a8;color:#e8f4ff;text-decoration:none;font-family:'Cinzel',Georgia,serif;font-size:14px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;padding:14px 40px;border-radius:6px;border:1px solid #2a9ec4;">
        ${label}
      </a>
    </td>
  </tr>`;
}

function emailFooter(year: number): string {
  return `
  <tr>
    <td style="padding:0 44px;">
      <div style="height:1px;background-color:#0d2840;"></div>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 44px 28px 44px;text-align:center;">
      <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#4a88a8;font-size:12px;letter-spacing:0.08em;">
        © ${year} LUXGRIMOIRE · ALL RIGHTS RESERVED
      </p>
    </td>
  </tr>
  <tr>
    <td style="height:3px;background:linear-gradient(to right,#060d18,#0d1f35,#2a9ec4,#0d1f35,#060d18);"></td>
  </tr>`;
}
