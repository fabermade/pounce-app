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
 * Config value looks like: { "provider": "resend", "apiKey": "env:RESEND_API_KEY", "fromEmail": "hello@company.com" }
 */
export function createEmailProvider(config: {
  provider: string;
  apiKey: string; // Already resolved from env:KEY
  fromEmail?: string;
}): EmailProvider {
  switch (config.provider) {
    case 'resend':
      return new (require('./resend.js').ResendProvider)(config.apiKey, config.fromEmail);
    case 'sendgrid':
      return new (require('./sendgrid.js').SendGridProvider)(config.apiKey, config.fromEmail);
    case 'mailgun':
      return new (require('./mailgun.js').MailgunProvider)(config.apiKey, config.fromEmail);
    default:
      throw new Error(`Unknown email provider: ${config.provider}`);
  }
}