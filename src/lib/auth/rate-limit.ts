/**
 * Login rate limiter — in-memory, per-IP.
 * 5 attempts per minute per IP. 429 + Retry-After header.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

interface AttemptRecord {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, AttemptRecord>();

/**
 * Check if an IP is rate-limited. Returns null if OK, or a Response if limited.
 */
export function checkLoginRateLimit(ip: string): Response | null {
  const now = Date.now();
  const record = attempts.get(ip);

  // No record or expired window → fresh start
  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return null;
  }

  // Within window — increment count
  record.count++;

  if (record.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - record.windowStart)) / 1000);
    return new Response(
      JSON.stringify({ error: 'Too many login attempts. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
        },
      },
    );
  }

  return null;
}

/**
 * Reset rate limit for an IP (e.g., after successful login).
 */
export function resetLoginRateLimit(ip: string): void {
  attempts.delete(ip);
}