# Launchpoint Public API v1 — validation report

Last verified on August 3, 2026 at 4:12 PM ET against the live v1 API with a Launchpoint test key. The key, post IDs, creator details, and response bodies are intentionally omitted.

Source contract: [Launchpoint OpenAPI](https://docs.launchpointhq.com/api-reference/openapi.json)

## Current result

- 17/17 feature checks passed.
- 17/17 missing-key checks returned the expected `401` error shape.
- A separate 21-request regression pass had no failures, timeouts, or calls over one second.
- An eight-route concurrent burst completed in 288–360 ms per route.

## Endpoint timings

| Endpoint | Result | Time |
| --- | --- | ---: |
| `GET /programs` | `200` | 109 ms |
| `GET /posts` | `200` | 325 ms |
| `GET /posts/{id}` | `200` | 214 ms |
| `GET /posts/{id}/metrics-history` | `200` | 265 ms |
| `POST /posts/export` | `200` | 85 ms |
| `GET /analytics/kpis` | `200` | 222 ms |
| `GET /analytics/videos` | `200` | 128 ms |
| `GET /analytics/accounts` | `200` | 250 ms |
| `GET /analytics/overview` | `200` | 220 ms |
| `GET /analytics/recruitment` | `200` | 102 ms |
| `POST /programs/{id}/invite` | expected validation `400` | 76 ms |
| `GET /payouts` | `200` | 652 ms |
| `GET /payouts/stats` | `200` | 126 ms |
| `GET /payouts/pending` | `200` | 128 ms |
| `GET /creators` | `200` | 120 ms |
| `GET /creators/collections` | `200` | 131 ms |
| `GET /contracts` | `200` | 113 ms |

The invite check intentionally uses an invalid program and limits. Passing means the route rejected the request without creating anything.

## Regression coverage

The focused regression pass verifies the previously problematic surfaces:

- Three wallet-activity request shapes.
- Three repeated tracked-account requests.
- Two real post-detail records plus real metric history.
- Isolated KPI, video, overview, and post-catalog timing.
- One concurrent burst across posts, KPIs, videos, overview, accounts, creators, payout stats, and recruitment.

## Run it

```bash
pnpm audit:api
pnpm profile:api
```

`audit:api` covers all 17 operations and every auth guard. `profile:api` runs read-only requests one at a time and prints only status, latency, response size, and rate-limit state.

## Dashboard safeguards

- The browser never receives the API key.
- Only documented v1 routes can pass through the server proxy.
- Sections load on demand, with at most two upstream calls at once.
- Successful GET responses are cached on the local server for 60 seconds.
- A timed-out refresh can reuse stale successful data.
- Upstream timeouts become a clear `504` after 45 seconds.
- Broken endpoints render an inline failure instead of blanking the page.
