/**
 * Email Parser — Extract clean text from inbound emails.
 *
 * Handles:
 * - HTML → plain text conversion (blockquote stripping, Gmail/Outlook quotes)
 * - Common signature removal (Gmail "On ... wrote:", Outlook separators)
 * - Multipart MIME handling (prefer plain text, fall back to HTML)
 * - In-Reply-To / References header extraction for threading
 * - Reply-to address extraction
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface ParsedEmail {
  /** Clean reply text (quotes/signatures stripped) */
  text: string;
  /** Original HTML body */
  html: string;
  /** Original plain text body (may contain quoted text) */
  rawText: string;
  /** Sender email address */
  from: string;
  /** Sender display name (if available) */
  fromName: string;
  /** Recipient email(s) */
  to: string[];
  /** Reply-To header (if different from From) */
  replyTo?: string;
  /** Subject line */
  subject: string;
  /** Message-ID header — used for threading */
  messageId?: string;
  /** In-Reply-To header — references the parent message */
  inReplyTo?: string;
  /** References header — full thread history */
  references?: string;
  /** All custom headers */
  headers: Record<string, string>;
}

// ─── HTML → Plain Text ────────────────────────────────────────────

/**
 * Convert HTML to plain text, preserving structure.
 * More thorough than the basic stripHtml in the old webhook handler.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  let text = html;

  // Remove style and script blocks entirely
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Convert block elements to newlines
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Convert <br> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<br[^>]*>/gi, '\n');

  // Convert links to text (URL in parentheses)
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)');

  // Convert lists
  text = text.replace(/<li[^>]*>/gi, '• ');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Collapse multiple spaces (but preserve newlines)
  text = text.replace(/[^\S\n]+/g, ' ');

  // Collapse more than 2 consecutive newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ─── Quote / Signature Stripping ──────────────────────────────────

/**
 * Patterns that indicate the start of a quoted reply section.
 * Ordered by specificity — most specific patterns first.
 */
const QUOTE_PATTERNS = [
  // Gmail: "On Mon, Jan 1, 2024 at 10:00 AM, John <john@example.com> wrote:"
  /^On .+, .+ wrote:/m,
  // Outlook: "From: john@example.com" or "From: John Smith"
  /^From: .+@.+/m,
  // Generic "-----Original Message-----" separator
  /^-----Original Message-----/m,
  // Generic "-----Reply Message-----" separator
  /^-----Reply Message-----/m,
  // Thunderbird/other: "On ... wrote:"
  /^On .* wrote:\s*$/m,
  // iOS Mail: "> " quoted lines
  /^(?:> )+/m,
  // Android: "On ... <...> wrote:" with angle brackets
  /^On .+<.+> wrote:/m,
  // Yahoo: "On ... wrote:" with dashes
  /^-{3,}\s*On .+ wrote:/m,
  // Horizontal rule separators (3+ dashes or underscores)
  /^_{3,}$/m,
  // Forward header
  /^-{3,} Forwarded message -{3,}/m,
  /^Begin forwarded message:/m,
];

/**
 * Strip quoted reply text from a plain text email body.
 * Returns only the new content the sender wrote.
 */
export function stripQuotedReply(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const replyLines: string[] = [];

  for (const line of lines) {
    // Check if this line matches any quote pattern
    const isQuoteStart = QUOTE_PATTERNS.some(pattern => pattern.test(line));
    if (isQuoteStart) break;

    // Also check for block of quoted lines (all starting with >)
    if (/^>\s/.test(line)) break;

    replyLines.push(line);
  }

  const reply = replyLines.join('\n').trim();
  return reply || text.trim(); // Fall back to full text if stripping removes everything
}

/**
 * Remove common email signatures.
 * Gmail signatures often start with "--" or are preceded by empty lines.
 */
export function stripSignature(text: string): string {
  if (!text) return '';

  // Common signature separators
  const sigPatterns = [
    /^--\s*$/m,           // Standard "-- " signature delimiter
    /^_{5,}$/m,           // Underscore separator
    /^\*{5,}$/m,          // Asterisk separator
    /^Sent from my iPhone/m,
    /^Sent from my BlackBerry/m,
    /^Get Outlook for/m,
    /^Sent from the/m,
  ];

  let result = text;
  for (const pattern of sigPatterns) {
    const match = result.search(pattern);
    if (match !== -1) {
      result = result.substring(0, match).trim();
    }
  }

  return result;
}

// ─── Email Address Parsing ─────────────────────────────────────────

/**
 * Parse email addresses from header fields.
 * Handles formats like "John Smith <john@example.com>" and bare addresses.
 */
export function parseEmailAddress(header: string): { name: string; email: string } {
  const match = header.match(/^(.+?)\s*<([^>]+)>/);
  if (match) {
    return {
      name: match[1]!.trim().replace(/^"|"$/g, ''),
      email: match[2]!.trim().toLowerCase(),
    };
  }

  // Bare email address
  return {
    name: '',
    email: header.trim().toLowerCase(),
  };
}

/**
 * Parse multiple email addresses from a header (To, Cc, etc.)
 */
export function parseEmailAddresses(header: string): string[] {
  if (!header) return [];

  return header
    .split(',')
    .map(part => {
      const match = part.trim().match(/<([^>]+)>/);
      return match ? match[1]!.trim().toLowerCase() : part.trim().toLowerCase();
    })
    .filter(email => email.includes('@'));
}

// ─── Main Parser ───────────────────────────────────────────────────

/**
 * Parse an inbound email into a clean, structured format.
 *
 * Takes the raw email data (from webhook or API) and returns:
 * - Clean reply text (quotes and signatures stripped)
 * - Thread headers (In-Reply-To, References, Message-ID)
 * - Sender info (from, fromName, replyTo)
 */
export function parseInboundEmail(raw: {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
}): ParsedEmail {
  const { from, subject, headers = {} } = raw;

  // Parse sender
  const sender = parseEmailAddress(from);

  // Parse recipients
  const toArray = Array.isArray(raw.to) ? raw.to : [raw.to];
  const toEmails = toArray.flatMap(parseEmailAddresses);

  // Parse Reply-To
  let replyTo: string | undefined;
  if (raw.replyTo) {
    const replyTos = Array.isArray(raw.replyTo) ? raw.replyTo : [raw.replyTo];
    const parsed = replyTos.flatMap(parseEmailAddresses);
    if (parsed.length > 0) replyTo = parsed[0];
  }

  // Get text content — prefer plain text over HTML
  let rawText = raw.text?.trim() || '';
  let html = raw.html?.trim() || '';

  // Convert HTML to text if no plain text available
  if (!rawText && html) {
    rawText = htmlToPlainText(html);
  }

  // Strip quoted replies and signatures
  let cleanText = stripQuotedReply(rawText);
  cleanText = stripSignature(cleanText);

  // If stripping removed everything, use the original text
  if (!cleanText && rawText) {
    cleanText = rawText;
  }

  // Extract threading headers
  const messageId = headers['Message-ID'] || headers['message-id'];
  const inReplyTo = headers['In-Reply-To'] || headers['in-reply-to'];
  const references = headers['References'] || headers['references'];

  return {
    text: cleanText || '(no content)',
    html,
    rawText,
    from: sender.email,
    fromName: sender.name,
    to: toEmails,
    replyTo,
    subject,
    messageId,
    inReplyTo: inReplyTo?.trim(),
    references: references?.trim(),
    headers,
  };
}

/**
 * Extract just the reply content from an email.
 * Convenience wrapper that returns only the clean text.
 */
export function extractReplyContent(text: string, html: string): string {
  const parsed = parseInboundEmail({
    from: '',
    to: [],
    subject: '',
    text,
    html,
  });
  return parsed.text;
}