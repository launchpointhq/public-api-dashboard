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

function isReviewActor(actor) {
  return actor === null || Boolean(actor && typeof actor.id === "string" && actor.id.length > 0 &&
    ["person", "api_key", "system"].includes(actor.type) && (actor.name === null || typeof actor.name === "string"));
}

function isConfirmation(value) {
  return value === null || Boolean(value && Number.isFinite(value.confirmedAt) &&
    (value.confirmedViews === null || Number.isFinite(value.confirmedViews)) &&
    ["person", "backlog", "unknown"].includes(value.source) && isReviewActor(value.confirmedBy) &&
    (value.source !== "backlog" || value.confirmedBy?.type === "system"));
}

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
  ["GET", "/posts/exclusions?programId=11111111-1111-4111-8111-111111111111&limit=1"],
  ["GET", "/onboarding/proofs?programId=11111111-1111-4111-8111-111111111111&limit=1"],
  ["GET", "/onboarding/not-a-real-creator?programId=11111111-1111-4111-8111-111111111111"],
  ["GET", "/posts/not-a-real-post"],
  ["GET", "/posts/not-a-real-post/metrics-history"],
  ["GET", "/posts/not-a-real-post/analysis"],
  ["POST", "/posts/export", { selectedIds: [] }],
  ["GET", "/analytics/kpis"],
  ["GET", "/analytics/videos?limit=1"],
  ["GET", "/analytics/accounts?limit=1"],
  ["GET", "/analytics/overview"],
  ["GET", "/analytics/leaderboard?program=11111111-1111-4111-8111-111111111111"],
  ["GET", "/analytics/recruitment"],
  ["POST", "/programs/not-a-real-program/invite", { expiresInDays: 91 }],
  ["GET", "/payouts?limit=1"],
  ["GET", "/payouts/stats"],
  ["GET", "/payouts/pending?limit=1"],
  ["GET", "/creators?limit=1"],
  ["GET", "/applications?pool=recommended&limit=1"],
  ["GET", "/applications?pool=all&limit=1"],
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

const programRows = extractRows(programs.payload);
const programId = programRows[0]?.id;
await request({
  name: programId ? "Get a real program leaderboard" : "Get leaderboard validation response",
  path: `/analytics/leaderboard?program=${encodeURIComponent(programId ?? "11111111-1111-4111-8111-111111111111")}`,
  expected: programId ? 200 : 404,
  check: (payload) => {
    if (!programId) {
      return {
        ok: Boolean(payload && typeof payload === "object" && "error" in payload),
        detail: "unknown program is hidden behind a 404",
      };
    }
    const data = payload?.data;
    return {
      ok: data?.programId === programId && Array.isArray(data?.topCreators) && Boolean(data?.summary),
      detail: "program totals and ranked creators returned",
    };
  },
});

const posts = await request({
  name: "List posts with pagination",
  path: "/posts?page=1&limit=2",
  expected: 200,
  check: (payload) => {
    const postRows = extractRows(payload);
    if (!postRows.length) return { ok: true, detail: "valid post page with no rows" };
    const post = postRows[0];
    const fields = ["creatorId", "crossPostGroupId", "url", "thumbnail", "metricsAvailable", "metricsRecordedAt", "deltaFromPrevDay"];
    return {
      ok: fields.every((field) => field in post) && typeof post.deltaFromPrevDay?.views === "number" && Number.isInteger(payload.totalPages) && postRows.every((row) => isConfirmation(row.confirmation)),
      detail: "post links, stable IDs, metrics, latest confirmation, and pagination returned",
    };
  },
});

const postRows = extractRows(posts.payload);
const postId = postRows[0]?.id ?? postRows[0]?.postId ?? postRows[0]?.videoId;

await request({
  name: postId ? "Get a real post" : "Get post validation response",
  path: `/posts/${encodeURIComponent(postId ?? "not-a-real-post")}`,
  expected: postId ? 200 : [400, 404],
  check: (payload) => ({ ok: postId ? isConfirmation(payload?.data?.confirmation) : typeof payload?.error === "string", detail: postId ? "real post detail includes nullable confirmation" : "missing post rejected safely" }),
});

if (programId) {
  await request({
    name: "List program exclusions with review attribution",
    path: `/posts/exclusions?programId=${encodeURIComponent(programId)}&page=1&limit=2`,
    expected: 200,
    check: (payload) => ({
      ok: Array.isArray(payload?.data) && payload.data.length <= 2 && payload.page === 1 &&
        Number.isInteger(payload.total) && Number.isInteger(payload.totalPages) && payload.data.every((row) =>
          row.program?.id === programId && typeof row.id === "string" && typeof row.creatorId === "string" &&
          Number.isFinite(row.exclusion?.excludedAt) && isReviewActor(row.exclusion?.actor) &&
          (row.exclusion?.viewsAtExclusion === null || Number.isFinite(row.exclusion?.viewsAtExclusion))),
      detail: "bounded exclusion page with nullable actor and view snapshot; no records required",
    }),
  });
  const proofs = await request({
    name: "List approved onboarding proofs with reviewer",
    path: `/onboarding/proofs?programId=${encodeURIComponent(programId)}&status=approved&page=1&limit=2`,
    expected: 200,
    check: (payload) => ({
      ok: Array.isArray(payload?.data) && payload.data.length <= 2 && payload.data.every((row) =>
        row.programId === programId && isReviewActor(row.reviewedBy) && Number.isFinite(row.reviewedAt)),
      detail: "approved proofs include a review time and nullable reviewer; no proofs required",
    }),
  });
  const creatorId = extractRows(proofs.payload)[0]?.creatorId;
  if (creatorId) await request({
    name: "Read creator onboarding decisions",
    path: `/onboarding/${encodeURIComponent(creatorId)}?programId=${encodeURIComponent(programId)}`,
    expected: [200, 403, 404],
    check: (payload, response) => {
      if (response.status !== 200) return { ok: typeof payload?.error === "string", detail: "review access or current roster membership refused safely" };
      const requirements = [...(payload.accounts ?? []).flatMap((account) => account.requirements ?? []), ...(payload.checklist ?? [])];
      return { ok: Array.isArray(payload.accounts) && Array.isArray(payload.checklist) && requirements.every((row) => row.decision === null || Boolean(row.decision &&
        (row.decision.source === null || typeof row.decision.source === "string") &&
        (row.decision.decidedAt === null || Number.isFinite(row.decision.decidedAt)) && isReviewActor(row.decision.decidedBy))),
      detail: "displayed requirements have nullable latest decision metadata" };
    },
  });
}

await request({
  name: postId ? "Get real post metric history" : "Get metric-history validation response",
  path: `/posts/${encodeURIComponent(postId ?? "not-a-real-post")}/metrics-history?days=30&limit=30`,
  expected: postId ? 200 : [400, 404],
  check: (payload) => ({ ok: Boolean(payload), detail: postId ? "real history returned" : "missing post rejected safely" }),
});

await request({
  name: postId ? "Get real post analysis" : "Get analysis validation response",
  path: `/posts/${encodeURIComponent(postId ?? "not-a-real-post")}/analysis`,
  expected: postId ? 200 : [400, 404],
  check: (payload) => {
    const data = payload && typeof payload === "object" ? payload.data : null;
    const ok = Boolean(
      data &&
        typeof data === "object" &&
        "analysisStatus" in data &&
        "storyboard" in data &&
        data.retention &&
        typeof data.retention === "object" &&
        "organic" in data.retention &&
        "paid" in data.retention
    );
    return { ok, detail: postId && ok ? "real analysis returned" : "missing post rejected safely" };
  },
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
for (const pool of ["recommended", "all"]) {
  await request({
    name: `${pool} pending applications`,
    path: `/applications?page=1&limit=2&status=pending&pool=${pool}`,
    expected: pool === "all" ? [200, 403] : 200,
    check: (payload, response) => {
      if (response.status === 403) {
        return {
          ok: payload?.error === "All applicants is not available for this workspace",
          detail: "All applicants is explicitly unavailable to this workspace",
        };
      }
      return {
        ok: Array.isArray(payload?.data) && payload.data.length <= 2 &&
          payload.page === 1 && Number.isInteger(payload.total) && payload.total >= payload.data.length &&
          Number.isInteger(payload.totalPages) && payload.totalPages >= 0 &&
          payload.data.every((row) => typeof row.id === "string" && typeof row.creatorId === "string" &&
            typeof row.programId === "string" && row.status === "pending"),
        detail: "bounded pending application page with opaque creator IDs and pagination totals",
      };
    },
  });
}
await request({
  name: "Reject an unknown application pool",
  path: "/applications?pool=invalid&limit=1",
  expected: 400,
  check: (payload) => ({ ok: typeof payload?.error === "string", detail: "invalid pool is rejected instead of silently changing population" }),
});
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
