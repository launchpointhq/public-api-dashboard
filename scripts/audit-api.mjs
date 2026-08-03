import fs from "node:fs";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(new URL("../.env.local", import.meta.url));

const apiKey = process.env.LAUNCHPOINT_API_KEY;
const baseUrl = process.env.LAUNCHPOINT_API_BASE_URL ?? "https://dashboard.launchpointhq.com/api/v1";

if (!apiKey) {
  console.error("Missing LAUNCHPOINT_API_KEY");
  process.exit(1);
}

const results = [];

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["data", "posts", "videos", "programs", "creators", "contracts", "accounts", "payouts", "items", "collections"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

async function request({ name, method = "GET", path, body, auth = true, expected, check }) {
  const startedAt = performance.now();
  let response;
  let payload;
  let raw = "";
  let error;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(auth ? { "x-api-key": apiKey } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    raw = await response.text();
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json") && raw) payload = JSON.parse(raw);
    else payload = raw;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const status = response?.status ?? 0;
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  const statusOk = expectedStatuses.includes(status);
  let assertion = { ok: true, detail: "response accepted" };
  if (statusOk && check) {
    try {
      assertion = check(payload, response);
    } catch (caught) {
      assertion = { ok: false, detail: caught instanceof Error ? caught.message : String(caught) };
    }
  }

  const result = {
    name,
    method,
    path,
    auth,
    status,
    ok: !error && statusOk && assertion.ok,
    latencyMs: Math.round(performance.now() - startedAt),
    contentType: response?.headers.get("content-type") ?? null,
    rateLimit: response?.headers.get("x-ratelimit-limit") ?? null,
    rateRemaining: response?.headers.get("x-ratelimit-remaining") ?? null,
    rateReset: response?.headers.get("x-ratelimit-reset") ?? null,
    assertion: assertion.detail,
    responseBytes: Buffer.byteLength(raw),
    error: error ?? (!statusOk ? `Expected ${expectedStatuses.join("/")}, got ${status}` : null),
    sample:
      typeof payload === "string"
        ? payload.slice(0, 180)
        : payload && typeof payload === "object"
          ? { keys: Object.keys(payload).slice(0, 20), rowCount: extractRows(payload).length }
          : payload,
  };
  results.push(result);
  return { result, payload };
}

const authPaths = [
  ["GET", "/programs?limit=1"],
  ["GET", "/posts?limit=1"],
  ["GET", "/posts/not-a-real-post"],
  ["GET", "/posts/not-a-real-post/metrics-history"],
  ["POST", "/posts/export", { selectedIds: [] }],
  ["GET", "/analytics/kpis"],
  ["GET", "/analytics/videos?limit=1"],
  ["GET", "/analytics/accounts?limit=1"],
  ["GET", "/analytics/overview"],
  ["GET", "/analytics/recruitment"],
  ["POST", "/programs/not-a-real-program/invite", { expiresInDays: 91 }],
  ["GET", "/payouts?limit=1"],
  ["GET", "/payouts/stats"],
  ["GET", "/payouts/pending?limit=1"],
  ["GET", "/creators?limit=1"],
  ["GET", "/creators/collections"],
  ["GET", "/contracts?limit=1"],
];

for (const [method, path, body] of authPaths) {
  await request({
    name: `Auth guard: ${method} ${path.split("?")[0]}`,
    method,
    path,
    body,
    auth: false,
    expected: [401, 402, 403],
    check: (payload) => ({
      ok: Boolean(payload && typeof payload === "object" && "error" in payload),
      detail: "returns the documented error object without a key",
    }),
  });
}

const listCheck = (payload) => ({
  ok: payload !== null && typeof payload === "object",
  detail: `valid object; ${extractRows(payload).length} row(s) in this page`,
});

const programs = await request({
  name: "List programs with pagination",
  path: "/programs?page=1&limit=2",
  expected: 200,
  check: listCheck,
});

const posts = await request({
  name: "List posts with pagination",
  path: "/posts?page=1&limit=2",
  expected: 200,
  check: listCheck,
});

const postRows = extractRows(posts.payload);
const postId = postRows[0]?.id ?? postRows[0]?.postId ?? postRows[0]?.videoId;

await request({
  name: postId ? "Get a real post" : "Get post validation response",
  path: `/posts/${encodeURIComponent(postId ?? "not-a-real-post")}`,
  expected: postId ? 200 : [400, 404],
  check: (payload) => ({ ok: Boolean(payload), detail: postId ? "real post detail returned" : "missing post rejected safely" }),
});

await request({
  name: postId ? "Get real post metric history" : "Get metric-history validation response",
  path: `/posts/${encodeURIComponent(postId ?? "not-a-real-post")}/metrics-history?days=30&limit=30`,
  expected: postId ? 200 : [400, 404],
  check: (payload) => ({ ok: Boolean(payload), detail: postId ? "real history returned" : "missing post rejected safely" }),
});

await request({
  name: "Export a header-only CSV",
  method: "POST",
  path: "/posts/export",
  body: { selectedIds: [] },
  expected: 200,
  check: (payload, response) => ({
    ok: typeof payload === "string" && (response.headers.get("content-type") ?? "").includes("text/csv"),
    detail: "empty selection returns a safe CSV without exporting account data",
  }),
});

await request({ name: "Get comprehensive KPIs", path: "/analytics/kpis", expected: 200, check: listCheck });
await request({
  name: "List tracked videos sorted by views",
  path: "/analytics/videos?page=1&limit=2&sortBy=views&sortOrder=desc",
  expected: 200,
  check: listCheck,
});
await request({
  name: "List tracked accounts sorted by total views",
  path: "/analytics/accounts?page=1&limit=2&sortBy=totalViews&sortOrder=desc",
  expected: 200,
  check: listCheck,
});
await request({ name: "Get analytics overview", path: "/analytics/overview", expected: 200, check: listCheck });

const today = new Date();
const prior = new Date(today);
prior.setUTCDate(prior.getUTCDate() - 30);
const ymd = (value) => value.toISOString().slice(0, 10);
await request({
  name: "Get 30 days of recruitment analytics",
  path: `/analytics/recruitment?fromDate=${ymd(prior)}&toDate=${ymd(today)}`,
  expected: 200,
  check: listCheck,
});

await request({
  name: "Reject an invalid invite request without changes",
  method: "POST",
  path: "/programs/not-a-real-program/invite",
  body: { expiresInDays: 91, maxUses: 0 },
  expected: [400, 404],
  check: (payload) => ({
    ok: Boolean(payload && typeof payload === "object" && "error" in payload),
    detail: "invalid program and limits are rejected; no invite was created",
  }),
});

await request({ name: "List wallet activity", path: "/payouts?page=1&limit=2", expected: 200, check: listCheck });
await request({ name: "Get payout wallet stats", path: "/payouts/stats", expected: 200, check: listCheck });
await request({
  name: "List pending payouts sorted by amount",
  path: "/payouts/pending?page=1&limit=2&sortBy=amount&sortOrder=desc",
  expected: 200,
  check: listCheck,
});
await request({ name: "List creators with campaign status", path: "/creators?page=1&limit=2", expected: 200, check: listCheck });
await request({ name: "List creator collections", path: "/creators/collections", expected: 200, check: listCheck });
await request({ name: "List contracts with pagination", path: "/contracts?page=1&limit=2", expected: 200, check: listCheck });

const functional = results.filter((result) => result.auth);
const auth = results.filter((result) => !result.auth);
const report = {
  ranAt: new Date().toISOString(),
  baseUrl,
  summary: {
    endpoints: functional.length,
    passed: functional.filter((result) => result.ok).length,
    failed: functional.filter((result) => !result.ok).length,
    authGuards: auth.length,
    authGuardsPassed: auth.filter((result) => result.ok).length,
  },
  results,
};

console.log(JSON.stringify(report, null, 2));
process.exit(functional.every((result) => result.ok) && auth.every((result) => result.ok) ? 0 : 2);
