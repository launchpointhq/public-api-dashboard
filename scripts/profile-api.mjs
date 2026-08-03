import fs from "node:fs";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const name = trimmed.slice(0, separator);
    if (!process.env[name]) process.env[name] = trimmed.slice(separator + 1);
  }
}

loadEnv(new URL("../.env.local", import.meta.url));

const key = process.env.LAUNCHPOINT_API_KEY;
const base = process.env.LAUNCHPOINT_API_BASE_URL ?? "https://dashboard.launchpointhq.com/api/v1";
if (!key) throw new Error("Missing LAUNCHPOINT_API_KEY");

const checks = [
  "/programs?page=1&limit=2",
  "/posts?page=1&limit=2",
  "/analytics/kpis",
  "/analytics/videos?page=1&limit=2&sortBy=views&sortOrder=desc",
  "/analytics/accounts?page=1&limit=2&sortBy=totalViews&sortOrder=desc",
  "/analytics/overview",
  "/analytics/recruitment",
  "/payouts?page=1&limit=2",
  "/payouts/stats",
  "/payouts/pending?page=1&limit=2&sortBy=amount&sortOrder=desc",
  "/creators?page=1&limit=2",
  "/creators/collections",
  "/contracts?page=1&limit=2",
];

const results = [];
for (const path of checks) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(45_000),
    });
    const bytes = Buffer.byteLength(await response.text());
    const latencyMs = Math.round(performance.now() - startedAt);
    results.push({
      path,
      status: response.status,
      latencyMs,
      bytes,
      rating: !response.ok ? "BAD" : latencyMs >= 10_000 ? "VERY SLOW" : latencyMs >= 2_000 ? "SLOW" : "OK",
      rateRemaining: response.headers.get("x-ratelimit-remaining"),
    });
  } catch {
    results.push({ path, status: 0, latencyMs: Math.round(performance.now() - startedAt), bytes: 0, rating: "TIMEOUT", rateRemaining: null });
  }
}

console.table(results);
const problems = results.filter((result) => result.rating !== "OK");
console.log(`\n${problems.length}/${results.length} reads were bad or slow.`);
process.exit(results.some((result) => result.rating === "BAD" || result.rating === "TIMEOUT") ? 2 : 0);
