# Changelog — @kb-labs/rest-api

## 1.0.0 — 2026-02-24

First stable release. Prior history represents internal R&D — this is the first versioned public release.

### Packages

| Package | Version |
|---------|---------|
| `@kb-labs/rest-api-core` | 1.0.0 |
| `@kb-labs/rest-api-contracts` | 1.0.0 |

### What's included

**`@kb-labs/rest-api-core`** — Fastify-based REST API server for the KB Labs platform. Includes:
- Plugin discovery and command routing
- Workflow and job management endpoints
- Observability routes (metrics, health, readiness)
- Incident detection and historical metrics services
- Rate limiting and envelope middleware
- SSE (Server-Sent Events) for workflow run events
- Structured logging via platform logger
- Redis-ready startup configuration

**`@kb-labs/rest-api-contracts`** — Shared Zod schemas and TypeScript types for REST/CLI/Studio API surfaces. Used by both server and client code for end-to-end type safety.

### API

Base path: `/api/v1`

Key endpoint groups:
- `GET /api/v1/health` — health check
- `GET /api/v1/routes` — lists all registered routes
- `GET /openapi.json` — OpenAPI spec
- `/api/v1/workflows/runs` — workflow execution
- `/api/v1/jobs` — job management
- `/api/v1/plugins` — plugin discovery and commands
- `/api/v1/observability` — metrics and system health

### Notes

- Starts on port `5050` by default
- Run with `pnpm rest:dev` from the monorepo root
- `rest-api-contracts` is a zero-dependency package safe to import from CLI and Studio
