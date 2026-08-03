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

The audit covers all 17 current OpenAPI operations plus a missing-key check for every route. Its invite check is validation-only and does not create anything.

The latest timings are documented in [docs/upstream-api-findings.md](docs/upstream-api-findings.md). `profile:api` provides a safe, read-only latency pass.

## Security

Do not deploy this app publicly with a sensitive API key unless you add access control. The server proxy protects the key from browser code, but a public deployment would make the proxied data routes reachable by visitors.

Environment files are ignored by git. Never commit `.env.local`.

Live contract: [Launchpoint OpenAPI](https://docs.launchpointhq.com/api-reference/openapi.json)
