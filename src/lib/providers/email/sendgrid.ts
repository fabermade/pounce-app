/**
 * SendGrid Email Provider
 * 
 * Enterprise favorite. Uses SendGrid v3 Mail Send API.
 */

import type { EmailProvider, EmailSendParams, EmailSendResult } from './base.js';

export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid';
  private apiKey: string;
  private defaultFromEmail: string;

  constructor(apiKey: string, defaultFromEmail?: string) {
    this.apiKey = apiKey;
    this.defaultFromEmail = defaultFromEmail ?? 'hello@pouncefirst.com';
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: params.from ?? this.defaultFromEmail },
        personalizations: [{ to: [{ email: params.to }] }],
        subject: params.subject,
        content: [{ type: 'text/html', value: params.html }],
        reply_to: params.replyTo ? { email: params.replyTo } : undefined,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SendGrid error ${response.status}: ${body}`);
    }

    // SendGrid returns the message ID in the X-Message-Id header
    const messageId = response.headers.get('X-Message-Id') ?? 'unknown';
    return { messageId };
  }
}