import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const verifyLink = `${frontendUrl}/auth/verify-email?token=${token}`;
    const from = process.env.SMTP_FROM ?? '"Luxgrimoire" <noreply@luxgrimoire.com>';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email – Luxgrimoire</title>
</head>
<body style="margin:0;padding:0;background-color:#0c0a09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c0a09;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#1c1917;border:1px solid #44403c;border-radius:12px;overflow:hidden;">
          <!-- Amber accent line -->
          <tr>
            <td style="height:4px;background:linear-gradient(to right,#d97706,#92400e);"></td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0 40px;text-align:center;">
              <p style="margin:0;color:#d97706;font-size:20px;font-weight:bold;letter-spacing:0.15em;text-transform:uppercase;">✦ Luxgrimoire</p>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding:24px 40px 0 40px;text-align:center;">
              <h1 style="margin:0;color:#f5f5f4;font-size:24px;font-weight:bold;line-height:1.3;">Confirm your email address</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:16px 40px 0 40px;">
              <p style="margin:0;color:#a8a29e;font-size:16px;line-height:1.6;">
                Thank you for creating a Luxgrimoire account. Please confirm your email address by clicking the button below.
              </p>
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td style="padding:32px 40px;text-align:center;">
              <a href="${verifyLink}" style="background-color:#d97706;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
                Verify Email Address
              </a>
            </td>
          </tr>
          <!-- Expiry note -->
          <tr>
            <td style="padding:0 40px 8px 40px;text-align:center;">
              <p style="margin:0;color:#a8a29e;font-size:14px;line-height:1.6;">This link expires in <strong style="color:#f5f5f4;">24 hours</strong>.</p>
            </td>
          </tr>
          <!-- Ignore note -->
          <tr>
            <td style="padding:0 40px 32px 40px;text-align:center;">
              <p style="margin:0;color:#57534e;font-size:13px;line-height:1.6;">If you didn't create an account, you can safely ignore this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #292524;text-align:center;">
              <p style="margin:0;color:#57534e;font-size:12px;">© ${new Date().getFullYear()} Luxgrimoire · All rights reserved</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Verify your Luxgrimoire email address',
      html,
    });

    this.logger.log(`Verification email sent to ${to}`);
  }
}
