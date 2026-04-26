/**
 * Outlook Inbox Provider — Microsoft Graph OAuth2 + API
 *
 * Connects to an Outlook/Office 365 inbox via Microsoft Graph API.
 * Uses OAuth2 for authentication and subscription webhooks for push notifications.
 *
 * Microsoft Graph docs: https://learn.microsoft.com/en-us/graph/api/resources/message
 */

import type { EmailInboxProvider, InboundEmail, OAuthTokens } from './base.js';

// ─── Config ─────────────────────────────────────────────────────────

const OUTLOOK_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'offline_access',  // Required for refresh tokens
];

const OUTLOOK_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const OUTLOOK_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// ─── Types ──────────────────────────────────────────────────────────

interface OutlookConfig {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenExpiry?: string;
}

interface OutlookMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  body?: {
    contentType: 'text' | 'html';
    content?: string;
  };
  bodyPreview?: string;
  sender?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  replyTo?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  internetMessageId?: string;
  internetMessageHeaders?: Array<{
    name: string;
    value: string;
  }>;
  receivedDateTime?: string;
  isRead?: boolean;
}

// ─── Provider ──────────────────────────────────────────────────────

export class OutlookInboxProvider implements EmailInboxProvider {
  readonly name = 'outlook';
  private config: OutlookConfig;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: OutlookConfig) {
    this.config = config;
  }

  // ─── OAuth ──────────────────────────────────────────────────────

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: OUTLOOK_SCOPES.join(' '),
      response_mode: 'query',
      state,
    });

    return `${OUTLOOK_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch(OUTLOOK_TOKEN_URL, {
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
      throw new Error(`Outlook OAuth code exchange failed: ${response.status} ${error}`);
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
    const response = await fetch(OUTLOOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        redirect_uri: '',  // Not required for refresh, but some endpoints need it
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Outlook token refresh failed: ${response.status} ${error}`);
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
      refreshToken: data.refresh_token ?? refreshToken,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  // ─── Authentication Check ────────────────────────────────────────

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await fetch(`${GRAPH_API_BASE}/me`, {
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
    // In production, this would use Microsoft Graph subscriptions (webhooks)
    let lastTimestamp = new Date().toISOString();

    this.pollingInterval = setInterval(async () => {
      try {
        const messages = await this.listNewMessages(lastTimestamp);
        for (const email of messages) {
          await onMessage(email);
        }
        // Update timestamp for next poll
        lastTimestamp = new Date().toISOString();
      } catch (err) {
        console.error('[outlook] Polling error:', err);
      }
    }, 30_000); // 30 seconds
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // ─── Microsoft Graph API ────────────────────────────────────────

  /**
   * List new messages since the given timestamp.
   */
  async listNewMessages(since?: string): Promise<InboundEmail[]> {
    const params = new URLSearchParams({
      '$top': '20',
      '$filter': since ? `receivedDateTime ge ${since}` : 'isRead eq false',
      '$orderby': 'receivedDateTime desc',
      '$select': 'id,subject,body,bodyPreview,sender,toRecipients,internetMessageId,receivedDateTime,isRead',
    });

    const response = await fetch(`${GRAPH_API_BASE}/me/messages?${params}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Outlook list messages failed: ${response.status}`);
    }

    const data = await response.json() as { value: OutlookMessage[] };
    const emails: InboundEmail[] = [];

    for (const msg of data.value) {
      try {
        const email = this.parseOutlookMessage(msg);
        emails.push(email);

        // Mark as read
        await this.markAsRead(msg.id);
      } catch (err) {
        console.error(`[outlook] Failed to parse message ${msg.id}:`, err);
      }
    }

    return emails;
  }

  /**
   * Fetch a single message by ID.
   */
  async getMessage(messageId: string): Promise<InboundEmail> {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/messages/${messageId}?$select=id,subject,body,bodyPreview,sender,toRecipients,replyTo,internetMessageId,internetMessageHeaders,receivedDateTime`,
      { headers: { Authorization: `Bearer ${this.config.accessToken}` } },
    );

    if (!response.ok) {
      throw new Error(`Outlook get message failed: ${response.status}`);
    }

    const message = await response.json() as OutlookMessage;
    return this.parseOutlookMessage(message);
  }

  /**
   * Mark a message as read.
   */
  private async markAsRead(messageId: string): Promise<void> {
    await fetch(`${GRAPH_API_BASE}/me/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    });
  }

  /**
   * Parse a Microsoft Graph message into InboundEmail format.
   */
  private parseOutlookMessage(msg: OutlookMessage): InboundEmail {
    // Extract headers
    const headers: Record<string, string> = {};
    if (msg.internetMessageHeaders) {
      for (const h of msg.internetMessageHeaders) {
        headers[h.name.toLowerCase()] = h.value;
      }
    }

    // Sender
    const from = msg.sender?.emailAddress?.address?.toLowerCase() ?? '';
    const fromName = msg.sender?.emailAddress?.name ?? '';

    // Recipients
    const to = (msg.toRecipients || [])
      .map(r => r.emailAddress?.address?.toLowerCase())
      .filter((e): e is string => !!e);

    // Reply-To
    const replyTo = msg.replyTo?.[0]?.emailAddress?.address?.toLowerCase();

    // Body
    const html = msg.body?.contentType === 'html' ? (msg.body?.content ?? '') : '';
    const text = msg.body?.contentType === 'text' ? (msg.body?.content ?? '') : (msg.bodyPreview ?? '');

    return {
      from,
      fromName,
      to,
      subject: msg.subject ?? '(no subject)',
      text,
      html,
      replyTo,
      messageId: msg.internetMessageId,
      inReplyTo: headers['in-reply-to']?.trim(),
      references: headers['references']?.trim(),
      headers,
      receivedAt: msg.receivedDateTime,
      providerId: msg.id,
    };
  }
}