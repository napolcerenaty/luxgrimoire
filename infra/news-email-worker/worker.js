/**
 * Cloudflare Email Worker for the LuxGrimoire news aggregator (spec section 2.2).
 *
 * Not deployed yet — deployment (Cloudflare Email Routing rule + Worker setup)
 * is a deliberately separate, later step (needs the Cloudflare dashboard).
 * This file only needs to be pasted into a Worker once that's ready.
 *
 * Flow: Cloudflare Email Routing receives mail for news@ and news-test@
 * (spec 2.2.2) -> routes to this Worker ("Send to a Worker", not "Forward to
 * email") -> this Worker parses the raw MIME message and POSTs a small JSON
 * payload to the API's public ingest endpoint, authenticated with a shared
 * secret (NOT the user's session — there is no logged-in user here).
 *
 * Requires the `postal-mime` package to be bundled with the Worker (parses
 * raw MIME into { subject, html, text, messageId, from }) — add it via
 * `npm install postal-mime` in this Worker's own project when it's set up.
 */

import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    const rawBytes = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(rawBytes);

    const payload = {
      subject: parsed.subject ?? '(no subject)',
      html: parsed.html ?? parsed.text ?? '',
      messageId: parsed.messageId ?? message.headers.get('message-id') ?? undefined,
    };

    const response = await fetch(`${env.LUXGRIMOIRE_API_BASE_URL}/news/ingest-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-News-Webhook-Secret': env.NEWS_EMAIL_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Surfaces in the Worker's Cloudflare dashboard logs — no retry queue on
      // our side yet; a failed ingest just means that one email is missed.
      console.error(`news ingest failed: HTTP ${response.status}`);
    }
  },
};

/**
 * wrangler.toml (create alongside this file when actually deploying):
 *
 *   name = "luxgrimoire-news-email"
 *   main = "worker.js"
 *   compatibility_date = "2026-07-22"
 *
 *   [vars]
 *   LUXGRIMOIRE_API_BASE_URL = "https://api.luxgrimoire.com"
 *   # NEWS_EMAIL_WEBHOOK_SECRET set via `wrangler secret put`, not committed here —
 *   # must match NEWS_EMAIL_WEBHOOK_SECRET in the API's own environment.
 *
 * Deployment steps (deferred — do this last):
 *   1. `npm install postal-mime` inside this folder, `wrangler deploy`.
 *   2. Cloudflare dashboard -> domain -> Email -> Email Routing -> Routing Rules:
 *      - news@luxgrimoire.com -> Action: Send to a Worker -> this Worker
 *      - news-test@luxgrimoire.com -> Action: Send to a Worker -> this Worker (spec 2.2.2)
 *   3. `wrangler secret put NEWS_EMAIL_WEBHOOK_SECRET` (same value as the API's env var).
 */
