/**
 * Email Inbox Provider — Base interface for receiving inbound emails.
 *
 * Each provider (Gmail, Outlook, etc.) implements this interface to:
 * - Authenticate via OAuth2
 * - Read incoming messages
 * - Push new messages to the processing pipeline
 *
 * The Resend webhook is a special case — it pushes emails via HTTP POST
 * and doesn't need this interface. Gmail and Outlook use OAuth2 to read
 * messages from the inbox.
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface InboundEmail {
  /** Sender email address */
  from: string;
  /** Sender display name (if available) */
  fromName?: string;
  /** Recipient email address(es) */
  to: string[];
  /** Subject line */
  subject: string;
  /** Plain text body (prefer this over HTML for LLM input) */
  text: string;
  /** HTML body */
  html: string;
  /** Reply-To address (if different from From) */
  replyTo?: string;
  /** Message-ID header (unique identifier for this message) */
  messageId?: string;
  /** In-Reply-To header (references parent message for threading) */
  inReplyTo?: string;
  /** References header (full thread history) */
  references?: string;
  /** All custom headers */
  headers: Record<string, string>;
  /** ISO timestamp when the email was received */
  receivedAt?: string;
  /** Provider-specific ID (Gmail message ID, Outlook message ID, etc.) */
  providerId?: string;
}

export interface EmailInboxProvider {
  /** Provider name (e.g. 'gmail', 'outlook') */
  readonly name: string;

  /**
   * Start listening for new emails.
   * For push providers (webhooks), this sets up the webhook subscription.
   * For pull providers, this starts a polling interval.
   * Calls onMessage for each new email received.
   */
  listen(onMessage: (email: InboundEmail) => Promise<void>): void;

  /**
   * Stop listening for new emails.
   * Clean up any subscriptions or polling intervals.
   */
  stop(): void;

  /**
   * Check if the provider is properly configured and authenticated.
   * Returns true if the provider can receive messages.
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Get the OAuth authorization URL for this provider.
   * User visits this URL to grant access to their inbox.
   */
  getAuthUrl(redirectUri: string, state: string): string;

  /**
   * Exchange an OAuth authorization code for access + refresh tokens.
   * Returns the tokens to be stored in business_config.
   */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /**
   * Refresh an expired access token using the refresh token.
   * Returns the new access token and updated expiry.
   */
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;  // seconds until expiry
  tokenType?: string;  // usually 'Bearer'
  scope?: string;
}

// ─── Provider Status ──────────────────────────────────────────────

export interface InboxStatus {
  connected: boolean;
  provider: string;
  lastSyncAt?: string;
  error?: string;
}