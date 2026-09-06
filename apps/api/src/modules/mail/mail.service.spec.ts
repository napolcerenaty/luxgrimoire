const mockSendMail = jest.fn().mockResolvedValue(undefined);
const mockSendTransac = jest.fn().mockResolvedValue(undefined);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));
jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: { sendTransacEmail: mockSendTransac },
  })),
}));

import { MailService } from './mail.service';

const ENV_KEYS = [
  'BREVO_API_KEY',
  'BREVO_WELCOME_TEMPLATE_ID',
  'BREVO_VERIFY_TEMPLATE_ID',
  'BREVO_RESET_TEMPLATE_ID',
  'SMTP_FROM',
  'FRONTEND_URL',
  'CONTACT_INBOX',
];

const ENV_SNAPSHOT = { ...process.env };

function build(env: Record<string, string | undefined> = {}): MailService {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  return new MailService();
}

describe('MailService', () => {
  afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
    jest.clearAllMocks();
  });

  describe('Brevo template path', () => {
    it('sends the welcome email through the configured template with the parsed sender', async () => {
      const svc = build({
        BREVO_API_KEY: 'key',
        BREVO_WELCOME_TEMPLATE_ID: '7',
        SMTP_FROM: '"LuxGrimoire" <noreply@luxgrimoire.com>',
        FRONTEND_URL: 'https://app.luxgrimoire.com',
      });

      await svc.sendWelcomeEmail('user@example.com', 'jane');

      expect(mockSendTransac).toHaveBeenCalledWith({
        templateId: 7,
        to: [{ email: 'user@example.com' }],
        params: { username: 'jane', appUrl: 'https://app.luxgrimoire.com' },
        sender: { name: 'LuxGrimoire', email: 'noreply@luxgrimoire.com' },
      });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does nothing (welcome has no SMTP fallback) when the template id is unset', async () => {
      const svc = build({ BREVO_API_KEY: 'key' });
      await svc.sendWelcomeEmail('user@example.com', 'jane');
      expect(mockSendTransac).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does not use the template when the API key is missing, even with a template id', async () => {
      const svc = build({ BREVO_WELCOME_TEMPLATE_ID: '7' });
      await svc.sendWelcomeEmail('user@example.com', 'jane');
      expect(mockSendTransac).not.toHaveBeenCalled();
    });

    it('falls back to a name-only sender when SMTP_FROM is not in "Name <email>" form', async () => {
      const svc = build({ BREVO_API_KEY: 'key', BREVO_WELCOME_TEMPLATE_ID: '7', SMTP_FROM: 'plain@x.com' });
      await svc.sendWelcomeEmail('user@example.com', 'jane');
      expect(mockSendTransac.mock.calls[0][0].sender).toEqual({ name: 'LuxGrimoire', email: 'plain@x.com' });
    });
  });

  describe('verification email', () => {
    it('uses the Brevo template with a verifyLink param and skips SMTP', async () => {
      const svc = build({ BREVO_API_KEY: 'key', BREVO_VERIFY_TEMPLATE_ID: '3', FRONTEND_URL: 'https://app.lg.com' });

      await svc.sendVerificationEmail('u@e.com', 'tok-123');

      expect(mockSendTransac.mock.calls[0][0].params).toEqual({
        verifyLink: 'https://app.lg.com/verify-email?token=tok-123',
      });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('falls back to SMTP with inline HTML when no template is configured', async () => {
      const svc = build({ SMTP_FROM: '"LuxGrimoire" <noreply@luxgrimoire.com>', FRONTEND_URL: 'https://app.lg.com' });

      await svc.sendVerificationEmail('u@e.com', 'tok-123');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const arg = mockSendMail.mock.calls[0][0];
      expect(arg).toMatchObject({ from: '"LuxGrimoire" <noreply@luxgrimoire.com>', to: 'u@e.com', subject: 'Verify your LuxGrimoire email address' });
      expect(arg.html).toContain('https://app.lg.com/verify-email?token=tok-123');
    });

    it('falls back to SMTP when the Brevo call throws', async () => {
      mockSendTransac.mockRejectedValueOnce(new Error('brevo 500'));
      const svc = build({ BREVO_API_KEY: 'key', BREVO_VERIFY_TEMPLATE_ID: '3' });

      await svc.sendVerificationEmail('u@e.com', 'tok-123');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('never throws even if SMTP delivery fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('smtp down'));
      const svc = build({});
      await expect(svc.sendVerificationEmail('u@e.com', 'tok-123')).resolves.toBeUndefined();
    });
  });

  describe('password reset email', () => {
    it('SMTP fallback carries the reset link and its own subject', async () => {
      const svc = build({ SMTP_FROM: '"LuxGrimoire" <noreply@luxgrimoire.com>', FRONTEND_URL: 'https://app.lg.com' });

      await svc.sendPasswordResetEmail('u@e.com', 'r-tok');

      const arg = mockSendMail.mock.calls[0][0];
      expect(arg.subject).toBe('Reset your LuxGrimoire password');
      expect(arg.html).toContain('https://app.lg.com/reset-password?token=r-tok');
    });
  });

  describe('contact form', () => {
    it('sends to the contact inbox with the submitter as replyTo and HTML-escaped body', async () => {
      const svc = build({ CONTACT_INBOX: 'inbox@lg.com', SMTP_FROM: '"LuxGrimoire" <noreply@luxgrimoire.com>' });

      await svc.sendContactMessage({ email: 'sender@x.com', subject: 'Bug', message: '1 < 2 & 3 > 0' });

      const arg = mockSendMail.mock.calls[0][0];
      expect(arg).toMatchObject({
        to: 'inbox@lg.com',
        subject: 'Contact form: Bug',
        replyTo: 'sender@x.com',
        from: '"LuxGrimoire" <noreply@luxgrimoire.com>',
      });
      expect(arg.html).toContain('1 &lt; 2 &amp; 3 &gt; 0');
    });

    it('defaults the recipient when CONTACT_INBOX is unset', async () => {
      const svc = build({});
      await svc.sendContactMessage({ email: 's@x.com', subject: 'Hi', message: 'hello' });
      expect(mockSendMail.mock.calls[0][0].to).toBe('contact@luxgrimoire.com');
    });
  });
});
