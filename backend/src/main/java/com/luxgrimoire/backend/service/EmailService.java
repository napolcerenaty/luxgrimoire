package com.luxgrimoire.backend.service;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String from;

    @Value("${app.mail.from-name}")
    private String fromName;

    @Value("${app.mail.enabled:true}")
    private boolean enabled;

    @Value("${app.base-url:http://localhost:5173}")
    private String baseUrl;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    @Async
    public void sendWelcome(String toEmail, String username, String firstName) {
        if (!canSend(toEmail)) return;
        String subject = "Witaj w LuxGrimoire, " + (firstName != null && !firstName.isBlank() ? firstName : username) + "! ✶";
        String body = baseTemplate(
            "Witaj w LuxGrimoire! ✶",
            "Twoje konto zostało pomyślnie utworzone.",
            "<p>Nazwa użytkownika: <strong>" + esc(username) + "</strong></p>" +
            "<p>Możesz teraz śledzić swoją kolekcję książek specjalnych edycji, subskrypcje, odkrywać nowe wydania i wiele więcej.</p>",
            "Przejdź do aplikacji", baseUrl
        );
        send(toEmail, subject, body);
    }

    @Async
    public void sendBugReportConfirmation(String toEmail, String username, String reportTitle, String reportId) {
        if (!canSend(toEmail)) return;
        String subject = "Zgłoszenie przyjęte: " + reportTitle;
        String body = baseTemplate(
            "Zgłoszenie przyjęte ✔",
            "Dziękujemy za zgłoszenie błędu.",
            "<p>Tytuł zgłoszenia: <strong>" + esc(reportTitle) + "</strong></p>" +
            "<p>Twoje zgłoszenie zostało przyjęte i będzie rozpatrzone przez nasz zespół. " +
            "O każdej zmianie statusu poinformujemy Cię mailem oraz powiadomieniem w aplikacji.</p>",
            "Otwórz aplikację", baseUrl
        );
        send(toEmail, subject, body);
    }

    @Async
    public void sendBugReportStatusUpdate(String toEmail, String username, String reportTitle, String newStatus, String adminNote) {
        if (!canSend(toEmail)) return;
        String subject = "Aktualizacja zgłoszenia: " + reportTitle;
        String noteHtml = (adminNote != null && !adminNote.isBlank())
            ? "<div class=\"note\"><strong>Komentarz zespołu:</strong><br>" + esc(adminNote) + "</div>"
            : "";
        String body = baseTemplate(
            "Status zgłoszenia zmieniony",
            "Twoje zgłoszenie błędu zostało zaktualizowane.",
            "<p>Tytuł: <strong>" + esc(reportTitle) + "</strong></p>" +
            "<p>Nowy status: <strong class=\"status\">" + esc(translateStatus(newStatus)) + "</strong></p>" +
            noteHtml,
            "Otwórz aplikację", baseUrl
        );
        send(toEmail, subject, body);
    }

    @Async
    public void sendDataRequestConfirmation(String toEmail, String username, String requestTitle, String requestId) {
        if (!canSend(toEmail)) return;
        String subject = "Zapotrzebowanie na dane przyjęte: " + requestTitle;
        String body = baseTemplate(
            "Zapotrzebowanie przyjęte ✔",
            "Dziękujemy za zgłoszenie brakujących danych.",
            "<p>Tytuł: <strong>" + esc(requestTitle) + "</strong></p>" +
            "<p>Twoje zgłoszenie zostało przyjęte. Postaramy się uzupełnić bazę danych jak najszybciej. " +
            "O zmianach statusu poinformujemy Cię mailem oraz powiadomieniem w aplikacji.</p>",
            "Otwórz aplikację", baseUrl
        );
        send(toEmail, subject, body);
    }

    @Async
    public void sendDataRequestStatusUpdate(String toEmail, String username, String requestTitle, String newStatus, String adminNote) {
        if (!canSend(toEmail)) return;
        String subject = "Aktualizacja zapotrzebowania: " + requestTitle;
        String noteHtml = (adminNote != null && !adminNote.isBlank())
            ? "<div class=\"note\"><strong>Komentarz zespołu:</strong><br>" + esc(adminNote) + "</div>"
            : "";
        String body = baseTemplate(
            "Status zapotrzebowania zmieniony",
            "Twoje zapotrzebowanie na dane zostało zaktualizowane.",
            "<p>Tytuł: <strong>" + esc(requestTitle) + "</strong></p>" +
            "<p>Nowy status: <strong class=\"status\">" + esc(translateStatus(newStatus)) + "</strong></p>" +
            noteHtml,
            "Otwórz aplikację", baseUrl
        );
        send(toEmail, subject, body);
    }

    @Async
    public void sendPasswordReset(String toEmail, String username, String resetToken) {
        if (!canSend(toEmail)) return;
        String resetLink = baseUrl + "?reset=" + resetToken;
        String subject = "Reset hasła — LuxGrimoire";
        String body = baseTemplate(
            "Reset hasła",
            "Otrzymaliśmy prośbę o reset hasła do Twojego konta.",
            "<p>Kliknij poniższy przycisk, aby ustawić nowe hasło. Link jest ważny przez <strong>24 godziny</strong>.</p>" +
            "<p>Jeśli to nie Ty wysłałeś/aś tę prośbę, zignoruj ten mail — Twoje hasło pozostanie bez zmian.</p>",
            "Zresetuj hasło", resetLink
        );
        send(toEmail, subject, body);
    }

    @Async
    public void sendCustom(String toEmail, String subject, String htmlContent) {
        if (!canSend(toEmail)) return;
        String body = baseTemplate(
            subject,
            "Wiadomość od zespołu LuxGrimoire",
            "<div>" + htmlContent + "</div>",
            "Otwórz LuxGrimoire", baseUrl
        );
        send(toEmail, subject, body);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private boolean canSend(String email) {
        if (!enabled) {
            log.debug("Email sending disabled, skipping.");
            return false;
        }
        if (email == null || email.isBlank() || !email.contains("@")) {
            log.debug("Skipping email — no valid address.");
            return false;
        }
        return true;
    }

    private void send(String to, String subject, String htmlBody) {
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(from, fromName);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(msg);
            log.info("Email sent to {} — subject: {}", to, subject);
        } catch (Exception e) {
            log.error("Failed to send email to {} — {}", to, e.getMessage());
        }
    }

    private String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private String translateStatus(String status) {
        if (status == null) return "";
        return switch (status.toLowerCase()) {
            case "open"        -> "Otwarte";
            case "in_progress" -> "W trakcie";
            case "resolved"    -> "Rozwiązane";
            case "closed"      -> "Zamknięte";
            case "rejected"    -> "Odrzucone";
            default            -> status;
        };
    }

    private String baseTemplate(String heading, String subheading, String contentHtml, String ctaLabel, String ctaUrl) {
        return """
            <!DOCTYPE html>
            <html lang="pl">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>LuxGrimoire</title>
              <style>
                body { margin:0; padding:0; background:#0d1117; font-family: 'Segoe UI', Arial, sans-serif; color:#c9d1d9; }
                .wrapper { max-width:600px; margin:40px auto; background:#161b22; border-radius:12px; overflow:hidden; border:1px solid #30363d; }
                .header { background:linear-gradient(135deg,#0d1117 0%,#1c2333 100%); padding:32px 40px; text-align:center; border-bottom:1px solid #30363d; }
                .logo { font-size:24px; font-weight:700; color:#d4af37; letter-spacing:3px; }
                .header-sub { color:#8b949e; font-size:12px; margin-top:4px; letter-spacing:2px; text-transform:uppercase; }
                .body { padding:32px 40px; }
                h1 { color:#e6edf3; font-size:22px; margin:0 0 8px 0; }
                .subheading { color:#8b949e; font-size:14px; margin:0 0 24px 0; }
                p { color:#c9d1d9; font-size:15px; line-height:1.6; margin:0 0 12px 0; }
                strong { color:#e6edf3; }
                .status { color:#d4af37; }
                .note { background:#1c2333; border-left:3px solid #d4af37; padding:12px 16px; border-radius:4px; margin:16px 0; font-size:14px; color:#c9d1d9; }
                .cta { text-align:center; margin:32px 0 16px 0; }
                .cta a { background:#d4af37; color:#0d1117; text-decoration:none; padding:12px 32px; border-radius:8px; font-weight:700; font-size:15px; letter-spacing:1px; display:inline-block; }
                .footer { background:#0d1117; padding:20px 40px; text-align:center; border-top:1px solid #30363d; }
                .footer p { color:#484f58; font-size:12px; margin:0; }
              </style>
            </head>
            <body>
              <div class="wrapper">
                <div class="header">
                  <div class="logo">✶ LuxGrimoire ✶</div>
                  <div class="header-sub">Special Edition Book Tracker</div>
                </div>
                <div class="body">
                  <h1>""" + heading + """
            </h1>
                  <p class="subheading">""" + subheading + """
            </p>
                  """ + contentHtml + """
                  <div class="cta"><a href=\"""" + ctaUrl + """
            \">""" + ctaLabel + """
            </a></div>
                </div>
                <div class="footer">
                  <p>LuxGrimoire &mdash; luxgrimoire.com</p>
                  <p style="margin-top:6px">Jeśli nie spodziewałeś/aś się tej wiadomości, zignoruj ją.</p>
                </div>
              </div>
            </body>
            </html>
            """;
    }
}
