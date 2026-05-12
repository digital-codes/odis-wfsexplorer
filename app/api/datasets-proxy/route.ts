import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
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

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `Upstream server returned ${upstream.status} ${upstream.statusText}.`,
        },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch upstream data.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
