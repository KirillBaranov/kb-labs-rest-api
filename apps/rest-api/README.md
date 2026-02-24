# @kb-labs/rest-api-app

Deployable Fastify application for the KB Labs REST API.

## Overview

Wires together `@kb-labs/rest-api-core`, plugin manifests, and runtime middleware into a production-ready HTTP service. All business capabilities come from discovered plugin manifests — the app itself only provides shared system endpoints and middleware.

## Running Locally

```bash
# From kb-labs-rest-api root
pnpm install
pnpm --filter @kb-labs/rest-api-app dev
# Server starts on http://localhost:5050
```

Build and run compiled output:

```bash
pnpm --filter @kb-labs/rest-api-app build
pnpm --filter @kb-labs/rest-api-app start
```

## Key Components

| Path | Responsibility |
|------|----------------|
| `src/bootstrap.ts` | Fastify server setup, middleware wiring, route registration |
| `src/index.ts` | Entry point — calls `bootstrap` with repo root |
| `src/routes/` | System routes: health, readiness, metrics, registry, OpenAPI, events |
| `src/middleware/` | Security headers, CORS, rate limiting, request envelopes, timeouts |
| `src/plugins/` | Plugin discovery and dynamic route mounting |
| `src/events/` | SSE hub and registry event bridge |

## System Endpoints

- `GET /health` — versioned health snapshot (`kb.health/1`)
- `GET /ready` — readiness probe (`200` or `503`)
- `GET /openapi.json` — aggregated OpenAPI from all mounted plugins
- `GET /api/v1/plugins/registry` — mounted plugin manifest list
- `GET /api/v1/metrics` — Prometheus metrics
- `GET /api/v1/events/registry` — SSE stream for registry and health changes

## Tests

```bash
# From repo root
pnpm test
```

## License

KB Public License v1.1 © KB Labs
