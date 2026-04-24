/**
 * Resend Email Provider
 * 
 * Default email provider. Great DX, free tier available.
 */

import { Resend } from 'resend';
import type { EmailProvider, EmailSendParams, EmailSendResult } from './base.js';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  private client: Resend;
  private defaultFromEmail: string;

  constructor(apiKey: string, defaultFromEmail?: string) {
    this.client = new Resend(apiKey);
    this.defaultFromEmail = defaultFromEmail ?? 'hello@pouncefirst.com';
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const { data, error } = await this.client.emails.send({
      from: params.from ?? this.defaultFromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    return { messageId: data?.id ?? 'unknown' };
  }
}