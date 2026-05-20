import { NextRequest, NextResponse } from "next/server";
import {
  isPrivateHostname,
  checkRateLimit,
  DEFAULT_RATE_LIMIT,
} from "@/lib/proxy-security";

const REQUEST_TIMEOUT_MS = 15000;

/** Max response size for datasets: 10 MB (JSON data is typically smaller) */
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * Extract client IP from request headers.
 */
function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }

  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

export async function GET(request: NextRequest) {
  // --- Rate Limiting ---
  const clientIP = getClientIP(request);
  const rateLimitKey = `datasets-proxy:${clientIP}`;
  const rateLimit = checkRateLimit(rateLimitKey, DEFAULT_RATE_LIMIT);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded.",
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
          ),
          "X-RateLimit-Limit": String(DEFAULT_RATE_LIMIT.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      }
    );
  }

  // --- URL Validation ---
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing required `url` query parameter." },
      { status: 400 }
    );
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL provided in `url` query parameter." },
      { status: 400 }
    );
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json(
      { error: "Only http/https URLs are allowed." },
      { status: 400 }
    );
  }

  // --- SSRF Protection: Block Private IPs ---
  if (isPrivateHostname(target.hostname)) {
    return NextResponse.json(
      { error: "Access to private/internal addresses is not allowed." },
      { status: 403 }
    );
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `Upstream server returned ${upstream.status} ${upstream.statusText}.`,
        },
        { status: upstream.status }
      );
    }

    // --- Response Size Check ---
    const contentLength = upstream.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        {
          error: `Response too large. Maximum allowed: ${MAX_RESPONSE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 }
      );
    }

    // Read response with size limit
    const text = await upstream.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        {
          error: `Response too large. Maximum allowed: ${MAX_RESPONSE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 }
      );
    }

    const data = JSON.parse(text);

    return NextResponse.json(
      { data },
      {
        status: 200,
        headers: {
          "X-RateLimit-Limit": String(DEFAULT_RATE_LIMIT.maxRequests),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch upstream data.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
