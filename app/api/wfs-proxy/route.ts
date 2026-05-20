import { NextRequest, NextResponse } from "next/server";
import {
  isPrivateHostname,
  checkRateLimit,
  readResponseWithLimit,
  DEFAULT_RATE_LIMIT,
  DEFAULT_MAX_RESPONSE_BYTES,
} from "@/lib/proxy-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Extract client IP from request headers.
 * Checks common proxy headers, falls back to "unknown".
 */
function getClientIP(request: NextRequest): string {
  // Check various headers that may contain the real client IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs; the first is the client
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }

  // Vercel-specific header
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

export async function GET(request: NextRequest) {
  // --- Rate Limiting ---
  const clientIP = getClientIP(request);
  const rateLimitKey = `wfs-proxy:${clientIP}`;
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
  const targetUrl = request.nextUrl.searchParams.get("url");
  const accept =
    request.nextUrl.searchParams.get("accept") ||
    "application/xml,text/xml,application/json,application/geo+json,*/*";

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing required 'url' query parameter." },
      { status: 400 }
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid target URL." },
      { status: 400 }
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Only http and https target URLs are allowed." },
      { status: 400 }
    );
  }

  // --- SSRF Protection: Block Private IPs ---
  if (isPrivateHostname(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: "Access to private/internal addresses is not allowed." },
      { status: 403 }
    );
  }

  try {
    const upstreamResponse = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        Accept: accept,

        // Ask the WFS server not to compress the response.
        // Some servers may ignore this, so we still strip Content-Encoding below.
        "Accept-Encoding": "identity",

        "User-Agent": "WFS-Analyzer/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });

    // --- Response Size Limiting ---
    const { data: body, truncated, totalSize } = await readResponseWithLimit(
      upstreamResponse,
      DEFAULT_MAX_RESPONSE_BYTES
    );

    const responseHeaders = new Headers();

    const contentType = upstreamResponse.headers.get("content-type");
    responseHeaders.set(
      "content-type",
      contentType || "application/octet-stream"
    );

    const contentDisposition =
      upstreamResponse.headers.get("content-disposition");
    if (contentDisposition) {
      responseHeaders.set("content-disposition", contentDisposition);
    }

    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("access-control-allow-origin", "*");
    responseHeaders.set("x-upstream-status", String(upstreamResponse.status));

    // Rate limit headers
    responseHeaders.set(
      "X-RateLimit-Limit",
      String(DEFAULT_RATE_LIMIT.maxRequests)
    );
    responseHeaders.set(
      "X-RateLimit-Remaining",
      String(rateLimit.remaining)
    );
    responseHeaders.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAt / 1000))
    );

    // Size limit headers
    if (truncated) {
      responseHeaders.set("X-Content-Truncated", "true");
      responseHeaders.set("X-Original-Size", String(totalSize));
      responseHeaders.set(
        "X-Max-Size",
        String(DEFAULT_MAX_RESPONSE_BYTES)
      );
    }

    // Important:
    // Do NOT forward:
    // - content-encoding
    // - content-length
    // - transfer-encoding
    // - connection
    // - keep-alive
    //
    // Server-side fetch may already decode gzip/br/deflate.
    // Forwarding the original Content-Encoding causes browser "Decoding failed".

    return new NextResponse(body, {
      status: truncated ? 206 : upstreamResponse.status, // 206 Partial Content if truncated
      statusText: truncated ? "Partial Content" : upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to reach upstream WFS service.";

    return NextResponse.json(
      {
        error: "WFS proxy request failed.",
        details: message,
      },
      { status: 502 }
    );
  }
}
