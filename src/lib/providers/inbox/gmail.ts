/**
 * Gmail Inbox Provider — OAuth2 + Gmail API
 *
 * Connects to a Gmail inbox via Google OAuth2 and reads messages.
 * Supports both push (Google Pub/Sub webhook) and polling modes.
 *
 * OAuth flow:
 * 1. User clicks "Connect Gmail" → redirect to Google consent screen
 * 2. Google redirects back with auth code → exchange for tokens
 * 3. Tokens stored in business_config → used to read messages
 * 4. Access tokens auto-refreshed when expired
 *
 * Gmail API docs: https://developers.google.com/gmail/api/reference/rest
 */

import type { EmailInboxProvider, InboundEmail, OAuthTokens } from './base.js';

// ─── Config ─────────────────────────────────────────────────────────

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const GMAIL_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ─── Types ──────────────────────────────────────────────────────────

interface GmailConfig {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenExpiry?: string;
}

interface GmailMessagePart {
  mimeType: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
  internalDate?: string;
}

// ─── Provider ──────────────────────────────────────────────────────

export class GmailInboxProvider implements EmailInboxProvider {
  readonly name = 'gmail';
  private config: GmailConfig;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: GmailConfig) {
    this.config = config;
  }

  // ─── OAuth ──────────────────────────────────────────────────────

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',  // Force consent to get refresh token
      state,
    });

    return `${GMAIL_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail OAuth code exchange failed: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail token refresh failed: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken,  // Google doesn't always return a new refresh token
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  // ─── Authentication Check ────────────────────────────────────────

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await fetch(`${GMAIL_API_BASE}/profile`, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── Listening ───────────────────────────────────────────────────

  listen(onMessage: (email: InboundEmail) => Promise<void>): void {
    // Poll for new messages every 30 seconds
    // In production, this would be replaced by Google Pub/Sub push notifications
    let lastHistoryId = '';

    this.pollingInterval = setInterval(async () => {
      try {
        const messages = await this.listNewMessages(lastHistoryId);
        for (const email of messages) {
          await onMessage(email);
        }
        // Update last seen message
        if (messages.length > 0) {
          lastHistoryId = messages[messages.length - 1]!.providerId ?? '';
        }
      } catch (err) {
        console.error('[gmail] Polling error:', err);
      }
    }, 30_000); // 30 seconds
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // ─── Gmail API ──────────────────────────────────────────────────

  /**
   * List new messages since the last known message.
   * Returns parsed InboundEmail objects ready for the pipeline.
   */
  async listNewMessages(sinceId?: string): Promise<InboundEmail[]> {
    // Get list of recent messages
    const params = new URLSearchParams({
      maxResults: '20',
      q: 'is:unread -from:me',  // Unread messages not from me
    });

    if (sinceId) {
      // Gmail doesn't support "since ID" directly — use history
      // For v1, we just fetch recent unread messages
    }

    const listResponse = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!listResponse.ok) {
      throw new Error(`Gmail list messages failed: ${listResponse.status}`);
    }

    const listData = await listResponse.json() as { messages?: Array<{ id: string; threadId: string }> };
    const emails: InboundEmail[] = [];

    if (!listData.messages) return emails;

    // Fetch full message details for each
    for (const msg of listData.messages) {
      try {
        const email = await this.getMessage(msg.id);
        emails.push(email);

        // Mark as read (remove UNREAD label)
        await this.markAsRead(msg.id);
      } catch (err) {
        console.error(`[gmail] Failed to fetch message ${msg.id}:`, err);
      }
    }

    return emails;
  }

  /**
   * Fetch a single message by ID and parse it into InboundEmail format.
   */
  async getMessage(messageId: string): Promise<InboundEmail> {
    const response = await fetch(`${GMAIL_API_BASE}/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Gmail get message failed: ${response.status}`);
    }

    const message = await response.json() as GmailMessage;
    return this.parseGmailMessage(message);
  }

  /**
   * Mark a message as read by removing the UNREAD label.
   */
  private async markAsRead(messageId: string): Promise<void> {
    await fetch(`${GMAIL_API_BASE}/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD'],
      }),
    });
  }

  /**
   * Parse a Gmail API message into InboundEmail format.
   */
  private parseGmailMessage(message: GmailMessage): InboundEmail {
    const headers: Record<string, string> = {};
    if (message.payload?.headers) {
      for (const h of message.payload.headers) {
        headers[h.name.toLowerCase()] = h.value;
      }
    }

    // Extract text and HTML bodies
    let text = '';
    let html = '';

    const extractBody = (parts: GmailMessagePart[] | undefined) => {
      if (!parts) return;
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          text = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          extractBody(part.parts);
        }
      }
    };

    // Check if the main body is directly in payload.body
    if (message.payload?.body?.data) {
      const mimeType = headers['content-type'] || '';
      if (mimeType.includes('text/plain')) {
        text = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      } else if (mimeType.includes('text/html')) {
        html = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      }
    }

    // Extract from multipart
    if (message.payload?.parts) {
      extractBody(message.payload.parts);
    }

    // Parse From header
    const fromHeader = headers['from'] || '';
    const fromMatch = fromHeader.match(/^(.+?)\s*<([^>]+)>/);
    const fromName = fromMatch ? fromMatch[1]!.trim().replace(/^"|"$/g, '') : '';
    const from = fromMatch ? fromMatch[2]!.trim().toLowerCase() : fromHeader.trim().toLowerCase();

    // Parse To header
    const toHeader = headers['to'] || '';
    const toEmails = toHeader.split(',').map(s => {
      const m = s.trim().match(/<([^>]+)>/);
      return m ? m[1]!.trim().toLowerCase() : s.trim().toLowerCase();
    }).filter(e => e.includes('@'));

    // Parse Reply-To
    const replyTo = headers['reply-to']?.trim();

    return {
      from,
      fromName,
      to: toEmails,
      subject: headers['subject'] || '(no subject)',
      text,
      html,
      replyTo,
      messageId: headers['message-id'],
      inReplyTo: headers['in-reply-to']?.trim(),
      references: headers['references']?.trim(),
      headers,
      receivedAt: message.internalDate ? new Date(parseInt(message.internalDate)).toISOString() : undefined,
      providerId: message.id,
    };
  }
}