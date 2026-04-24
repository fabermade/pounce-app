/**
 * Email Provider Interface
 * 
 * All email sending providers implement this interface.
 * The admin chooses which provider at runtime via business config.
 */

export interface EmailSendParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
}

export interface EmailProvider {
  /** Unique identifier for this provider */
  readonly name: string;

  /**
   * Send an email. Returns the message ID from the provider.
   */
  send(params: EmailSendParams): Promise<EmailSendResult>;
}

/**
 * Factory: create an email provider from business config.
 * Uses dynamic import() for ESM compatibility (Astro/Vite).
 */
export async function createEmailProvider(config: {
  provider: string;
  apiKey: string;
  fromEmail?: string;
}): Promise<EmailProvider> {
  switch (config.provider) {
    case 'resend': {
      const { ResendProvider } = await import('./resend.js');
      return new ResendProvider(config.apiKey, config.fromEmail);
    }
    case 'sendgrid': {
      const { SendGridProvider } = await import('./sendgrid.js');
      return new SendGridProvider(config.apiKey, config.fromEmail);
    }
    case 'mailgun': {
      const { MailgunProvider } = await import('./mailgun.js');
      return new MailgunProvider(config.apiKey, config.fromEmail);
    }
    default:
      throw new Error(`Unknown email provider: ${config.provider}`);
  }
}