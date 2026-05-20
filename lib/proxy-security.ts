/**
 * Security utilities for proxy routes.
 *
 * Provides:
 * - Private IP blocking (SSRF protection)
 * - Rate limiting
 * - Response size limiting
 */

// ----------------------------------------------------------------------------
// Private IP Detection (SSRF Protection)
// ----------------------------------------------------------------------------

/**
 * Check if an IP address is in a private/internal range.
 * Blocks access to:
 * - 127.0.0.0/8 (localhost)
 * - 10.0.0.0/8 (private class A)
 * - 172.16.0.0/12 (private class B)
 * - 192.168.0.0/16 (private class C)
 * - 169.254.0.0/16 (link-local, AWS/GCP/Azure metadata)
 * - 0.0.0.0/8 (current network)
 * - ::1 (IPv6 localhost)
 * - fc00::/7 (IPv6 unique local)
 * - fe80::/10 (IPv6 link-local)
 */
export function isPrivateIP(ip: string): boolean {
  // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  // IPv4 checks
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);

    // 127.0.0.0/8 - Localhost
    if (a === 127) return true;

    // 10.0.0.0/8 - Private class A
    if (a === 10) return true;

    // 172.16.0.0/12 - Private class B (172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 - Private class C
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 - Link-local (cloud metadata endpoint!)
    if (a === 169 && b === 254) return true;

    // 0.0.0.0/8 - Current network
    if (a === 0) return true;

    return false;
  }

  // IPv6 checks
  const ipLower = ip.toLowerCase();

  // ::1 - IPv6 localhost
  if (ipLower === "::1") return true;

  // fc00::/7 - IPv6 unique local addresses (fc00:: - fdff::)
  if (ipLower.startsWith("fc") || ipLower.startsWith("fd")) return true;

  // fe80::/10 - IPv6 link-local
  if (ipLower.startsWith("fe80")) return true;

  return false;
}

/**
 * Check if a hostname resolves to a private IP.
 * Also blocks common private hostnames.
 */
export function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block common private/dangerous hostnames
  const blockedHostnames = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "metadata.google.internal", // GCP metadata
    "metadata.google", // GCP metadata
    "169.254.169.254", // AWS/Azure/GCP metadata IP
  ];

  if (blockedHostnames.includes(lower)) return true;

  // Block .local domains
  if (lower.endsWith(".local")) return true;

  // Block .internal domains
  if (lower.endsWith(".internal")) return true;

  // Check if it's a raw IP address
  if (isPrivateIP(lower)) return true;

  // Check for IPv6 addresses in brackets
  if (lower.startsWith("[") && lower.endsWith("]")) {
    const ipv6 = lower.slice(1, -1);
    if (isPrivateIP(ipv6)) return true;
  }

  return false;
}

// ----------------------------------------------------------------------------
// Rate Limiting
// ----------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically (every 5 minutes)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function cleanupRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request is within rate limits.
 * Uses a sliding window counter per key (typically client IP).
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanupRateLimitStore();

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No entry or expired window - create new entry
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }

  // Within window - check and increment
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// ----------------------------------------------------------------------------
// Response Size Limiting
// ----------------------------------------------------------------------------

export interface StreamLimitResult {
  data: ArrayBuffer;
  truncated: boolean;
  totalSize: number;
}

/**
 * Read a response stream with a maximum size limit.
 * Aborts and returns partial data if limit is exceeded.
 */
export async function readResponseWithLimit(
  response: Response,
  maxBytes: number
): Promise<StreamLimitResult> {
  const reader = response.body?.getReader();

  if (!reader) {
    // No body - return empty
    return {
      data: new ArrayBuffer(0),
      truncated: false,
      totalSize: 0,
    };
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalSize += value.byteLength;

      if (totalSize > maxBytes) {
        // Keep only up to the limit
        const excess = totalSize - maxBytes;
        const keep = value.byteLength - excess;
        if (keep > 0) {
          chunks.push(value.slice(0, keep));
        }
        truncated = true;
        break;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate chunks into single ArrayBuffer
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    data: result.buffer,
    truncated,
    totalSize,
  };
}

// ----------------------------------------------------------------------------
// Default Configurations
// ----------------------------------------------------------------------------

/** Default rate limit: 100 requests per minute */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

/** Default max response size: 50 MB */
export const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
