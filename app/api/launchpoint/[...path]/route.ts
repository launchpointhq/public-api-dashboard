import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedGetPaths = [
  /^programs$/,
  /^posts$/,
  /^posts\/[^/]+$/,
  /^posts\/[^/]+\/metrics-history$/,
  /^analytics\/(kpis|videos|accounts|overview|recruitment)$/,
  /^payouts$/,
  /^payouts\/(stats|pending)$/,
  /^creators$/,
  /^creators\/collections$/,
  /^contracts$/,
];

const allowedPostPaths = [/^posts\/export$/, /^programs\/[^/]+\/invite$/];

type CacheEntry = {
  body: ArrayBuffer;
  status: number;
  headers: Record<string, string>;
  expiresAt: number;
};

const globalCache = globalThis as typeof globalThis & { launchpointResponseCache?: Map<string, CacheEntry> };
const responseCache = globalCache.launchpointResponseCache ?? new Map<string, CacheEntry>();
globalCache.launchpointResponseCache = responseCache;

function isAllowed(method: string, path: string) {
  const rules = method === "GET" ? allowedGetPaths : method === "POST" ? allowedPostPaths : [];
  return rules.some((rule) => rule.test(path));
}

async function forward(request: NextRequest, segments: string[], method: "GET" | "POST") {
  const key = process.env.LAUNCHPOINT_API_KEY;
  const base = process.env.LAUNCHPOINT_API_BASE_URL ?? "https://dashboard.launchpointhq.com/api/v1";
  const path = segments.join("/");

  if (!key) return NextResponse.json({ error: "Server API key is not configured" }, { status: 500 });
  if (!isAllowed(method, path)) return NextResponse.json({ error: "Endpoint is not allowed" }, { status: 404 });

  const upstreamUrl = new URL(`${base}/${path}`);
  request.nextUrl.searchParams.forEach((value, name) => upstreamUrl.searchParams.append(name, value));
  const cacheKey = upstreamUrl.toString();
  const cached = method === "GET" ? responseCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.body.slice(0), {
      status: cached.status,
      headers: { ...cached.headers, "x-launchpoint-cache": "hit" },
    });
  }

  const body = method === "POST" ? await request.text() : undefined;
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        "x-api-key": key,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    if (cached) {
      return new NextResponse(cached.body.slice(0), {
        status: cached.status,
        headers: { ...cached.headers, "x-launchpoint-cache": "stale" },
      });
    }
    return NextResponse.json({ error: "Launchpoint did not respond within 45 seconds" }, { status: 504 });
  }

  const responseBody = await upstream.arrayBuffer();
  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "no-store");

  if (method === "GET" && upstream.ok) {
    responseCache.set(cacheKey, {
      body: responseBody.slice(0),
      status: upstream.status,
      headers: Object.fromEntries(headers.entries()),
      expiresAt: Date.now() + 60_000,
    });
  }

  return new NextResponse(responseBody, { status: upstream.status, headers });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path, "POST");
}
