/**
 * Mailgun Email Provider
 * 
 * Good for high-volume sending. Uses Mailgun v3 API.
 */

import type { EmailProvider, EmailSendParams, EmailSendResult } from './base.js';

export class MailgunProvider implements EmailProvider {
  readonly name = 'mailgun';
  private apiKey: string;
  private domain: string;
  private defaultFromEmail: string;

  constructor(apiKey: string, defaultFromEmail?: string, domain?: string) {
    this.apiKey = apiKey;
    this.domain = domain ?? process.env.MAILGUN_DOMAIN ?? '';
    this.defaultFromEmail = defaultFromEmail ?? `hello@${this.domain}`;
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const from = params.from ?? this.defaultFromEmail;
    const response = await fetch(
      `https://api.mailgun.net/v3/${this.domain}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
          ...(params.replyTo ? { 'h:Reply-To': params.replyTo } : {}),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mailgun error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { id: string };
    return { messageId: data.id ?? 'unknown' };
  }
}