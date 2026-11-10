# Launchpoint Signal Room

A live dashboard and endpoint lab for the Launchpoint Public API v1.

## Run it

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The API key lives only in `.env.local`. Browser requests go through a strict local proxy, so the key is never added to client code.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm audit:api
pnpm profile:api
```

The audit covers the endpoint lab's operations plus missing-key checks. It uses the first visible program for the leaderboard check. Its invite check is validation-only and does not create anything.

The endpoint lab's **Browse applications** request defaults to pending Recommended applicants. Change the query to `pool=all` to request Recommended plus additional eligible applicants. This is a combined population, not an additional-only pool. The proxy still keeps the key server-side and only permits the exact read route. There is no separate applications table in this demo; the existing endpoint lab renders the description, editable query and API response.

Run the application-pool audit after the matching backend change is deployed. It accepts a documented `403` for an unavailable All applicants pool, verifies bounded pending-application pages without requiring any applicants, and rejects unknown pool values. It also checks that both pools reject a missing key. The recorded audit snapshot is historical and does not claim these new checks have run.

The latest timings are documented in [docs/upstream-api-findings.md](docs/upstream-api-findings.md). `profile:api` provides a safe, read-only latency pass.

## Review attribution

The Content table and post detail show the latest saved confirmation: actor, time, and highest-platform views at confirmation. Backlog cleanup is labeled as a system action, not a human review. This stamp is not a complete review history or a payment decision.

In API lab, select **Review account proofs**, **Creator onboarding decisions**, or **List excluded posts**. Replace the program ID (and creator ID when needed), then run the read request. A table below the response shows the review metadata. Use `page` and `limit` to read more records. Reviewer IDs are opaque and scoped to the requesting workspace; absent names and actors stay unavailable. Exclusion views are each post's last observed views when it was excluded, not the video's highest-platform views.

Deploy the matching backend review-attribution change and its exclusion migration before using these routes or running the expanded audit. Old exclusions do not gain inferred actors or view snapshots. The audit validates the new fields when records exist and accepts empty pages. The recorded audit snapshot predates this change; it is not evidence of this rollout.

## Security

Do not deploy this app publicly with a sensitive API key unless you add access control. The server proxy protects the key from browser code, but a public deployment would make the proxied data routes reachable by visitors.

Environment files are ignored by git. Never commit `.env.local`.

Live contract: [Launchpoint OpenAPI](https://docs.launchpointhq.com/api-reference/openapi.json)
