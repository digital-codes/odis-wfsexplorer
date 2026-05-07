import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 15000;

export async function GET(request: NextRequest) {
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

    const body = await upstreamResponse.arrayBuffer();

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
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
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