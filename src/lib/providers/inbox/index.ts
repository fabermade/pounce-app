/**
 * Inbox Provider Factory — Create the right inbox provider from config.
 */

import type { EmailInboxProvider } from './base.js';
import { GmailInboxProvider } from './gmail.js';
import { OutlookInboxProvider } from './outlook.js';

export function createInboxProvider(config: {
  provider: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenExpiry?: string;
}): EmailInboxProvider | null {
  switch (config.provider) {
    case 'gmail':
      return new GmailInboxProvider({
        accessToken: config.accessToken ?? '',
        refreshToken: config.refreshToken ?? '',
        clientId: config.clientId ?? '',
        clientSecret: config.clientSecret ?? '',
        tokenExpiry: config.tokenExpiry,
      });

    case 'outlook':
      return new OutlookInboxProvider({
        accessToken: config.accessToken ?? '',
        refreshToken: config.refreshToken ?? '',
        clientId: config.clientId ?? '',
        clientSecret: config.clientSecret ?? '',
        tokenExpiry: config.tokenExpiry,
      });

    default:
      console.warn(`[inbox] Unknown inbox provider: ${config.provider}`);
      return null;
  }
}

export { GmailInboxProvider } from './gmail.js';
export { OutlookInboxProvider } from './outlook.js';
export type { EmailInboxProvider, InboundEmail, OAuthTokens, InboxStatus } from './base.js';