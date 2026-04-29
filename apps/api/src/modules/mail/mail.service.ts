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
    // Nodemailer for verification emails (HTML in-code)
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.brevo.com',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Brevo API client for template-based emails
    if (process.env.BREVO_API_KEY) {
      this.brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    }

    const fromRaw = process.env.SMTP_FROM ?? '"Luxgrimoire" <noreply@luxgrimoire.com>';
    const match = fromRaw.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
    this.brevoFrom = match
      ? { name: match[1].trim(), email: match[2].trim() }
      : { name: 'Luxgrimoire', email: fromRaw };
  }

  /**
   * Send welcome email via Brevo template.
   * Configure BREVO_WELCOME_TEMPLATE_ID in .env with the ID from Brevo dashboard.
   * Template params: {{ params.username }}, {{ params.appUrl }}
   */
  async sendWelcomeEmail(to: string, username: string): Promise<void> {
    const templateId = parseInt(process.env.BREVO_WELCOME_TEMPLATE_ID ?? '0', 10);
    if (!templateId || !this.brevo) {
      this.logger.warn('Welcome email skipped: BREVO_API_KEY or BREVO_WELCOME_TEMPLATE_ID not configured');
      return;
    }

    const appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        templateId,
        to: [{ email: to }],
        params: { username, appUrl },
        sender: this.brevoFrom,
      });
      this.logger.log(`Welcome email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send welcome email to ${to}`, err);
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const verifyLink = `${frontendUrl}/auth/verify-email?token=${token}`;
    const from = process.env.SMTP_FROM ?? '"Luxgrimoire" <noreply@luxgrimoire.com>';
    const year = new Date().getFullYear();

    const html = emailShell(`Verify your email – Luxgrimoire`, `
      ${emailBrand()}
      ${emailTitle('Confirm Your Email Address')}
      <tr>
        <td style="padding:16px 44px 0 44px;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:17px;line-height:1.75;text-align:center;">
            Thank you for creating a Luxgrimoire account. Please confirm your email address to activate your account.
          </p>
        </td>
      </tr>
      ${emailButton(verifyLink, 'Verify Email Address')}
      <tr>
        <td style="padding:0 44px 8px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:15px;line-height:1.6;">
            This link expires in <span style="color:#c0e4f4;font-weight:600;">24 hours</span>.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 44px 36px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#4a88a8;font-size:14px;line-height:1.6;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </td>
      </tr>
      ${emailFooter(year)}
    `);

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Verify your Luxgrimoire email address',
      html,
    });

    this.logger.log(`Verification email sent to ${to}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;
    const from = process.env.SMTP_FROM ?? '"Luxgrimoire" <noreply@luxgrimoire.com>';
    const year = new Date().getFullYear();

    const html = emailShell(`Reset your password – Luxgrimoire`, `
      ${emailBrand()}
      ${emailTitle('Reset Your Password')}
      <tr>
        <td style="padding:16px 44px 0 44px;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:17px;line-height:1.75;text-align:center;">
            We received a request to reset the password for your Luxgrimoire account. Click the button below to set a new password.
          </p>
        </td>
      </tr>
      ${emailButton(resetLink, 'Reset Password')}
      <tr>
        <td style="padding:0 44px 8px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#7ab0cc;font-size:15px;line-height:1.6;">
            This link expires in <span style="color:#c0e4f4;font-weight:600;">1 hour</span>.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 44px 36px 44px;text-align:center;">
          <p style="margin:0;font-family:'Crimson Text',Georgia,serif;color:#4a88a8;font-size:14px;line-height:1.6;">
            If you didn't request a password reset, you can safely ignore this email. Your password will not change.
          </p>
        </td>
      </tr>
      ${emailFooter(year)}
    `);

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Reset your Luxgrimoire password',
      html,
    });

    this.logger.log(`Password reset email sent to ${to}`);
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
        Luxgrimoire
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
