# @kb-labs/rest-api-app

REST API application for KB Labs, providing HTTP endpoints for plugin functionality.

## Vision & Purpose

**@kb-labs/rest-api-app** is the deployable REST API server for the KB Labs ecosystem.  
It wires together `@kb-labs/rest-api-core`, plugin manifests, and runtime middleware into a Fastify-based HTTP service.

### Core Goals

- **Expose plugin-powered HTTP endpoints** (workflows, analytics, audit, release, etc.)
- **Serve shared system endpoints**: health, readiness, metrics, OpenAPI, plugin registry
- **Provide a thin, secure HTTP layer** over the plugin runtime (no heavy business logic inside the app)

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
REST API App (@kb-labs/rest-api-app)
    │
    ├──► Bootstrap (Fastify server + middleware)
    ├──► Routes (health, workflows, plugins, metrics, events, readiness)
    ├──► Plugins (REST adapters discovered from manifests)
    ├──► Middleware (envelopes, rate limiting, security headers, timeouts)
    └──► Events & SSE (event hub, SSE event bridge)
```

### Key Components

- `src/bootstrap.ts`: Server bootstrap (Fastify instance, wiring middleware and routes)
- `src/index.ts`: Application entry point (calls `bootstrap` with repo root)
- `src/routes/*`: HTTP routes (health, workflows, plugins, metrics, events, readiness, OpenAPI)
- `src/middleware/*`: Cross-cutting concerns (envelopes, security headers, rate limiting, timeouts, mock mode)
- `src/plugins/*`: Integration with plugin discovery and plugin runtime
- `src/events/*`: Server-sent events (SSE) hub and bridges
- `src/utils/*`: Helpers for repo discovery, schema validation, and SSE auth

## Features

- **Plugin-first**: All business capabilities come from discovered plugin manifests
- **System endpoints**: health/readiness, metrics, registry, OpenAPI
- **SSE support**: real-time job/event streaming via SSE event hub
- **Security middleware**: security headers, timeouts, rate limits, CORS and mock mode
- **Structured envelopes**: consistent response envelopes backed by `@kb-labs/api-contracts`

## Dependencies

### Runtime

- `@kb-labs/rest-api-core`: configuration loading and core REST options
- `@kb-labs/api-contracts`: shared API contracts (error codes, envelopes, system schemas)
- `@kb-labs/core-sys`, `@kb-labs/core-workspace`: logging, workspace, and system utilities
- `@kb-labs/cli-api`, `@kb-labs/cli-core`: CLI integration and plugin discovery helpers
- `@kb-labs/plugin-manifest`, `@kb-labs/plugin-adapter-rest`, `@kb-labs/plugin-runtime`: plugin discovery, REST adapters, and sandboxed execution
- `fastify`, `@fastify/cors`, `@fastify/rate-limit`, `fastify-plugin`: HTTP server + middleware
- `pino`, `pino-pretty`: logging
- `zod`, `yaml`, `ulid`: validation, config parsing, identifiers

### Development

- `@kb-labs/devkit`: shared TS/ESLint/Vitest/TSUP presets
- `typescript`, `tsup`, `tsx`, `vitest`

## Running Locally

From the `kb-labs-rest-api` repo root:

```bash
pnpm install
pnpm --filter @kb-labs/rest-api-app dev
```

By default the server starts on `http://localhost:3001` (see repo README for env vars).

To build and run the compiled app:

```bash
pnpm --filter @kb-labs/rest-api-app build
pnpm --filter @kb-labs/rest-api-app start
```

## Tests

Most behaviour is covered by route and middleware tests in the `apps/rest-api` and `packages/rest-api-core` layers.  
Run from repo root:

```bash
pnpm test
```

## Relationship to `@kb-labs/rest-api`

- The **repo root** (`@kb-labs/rest-api`) documents the overall project and architecture.
- **This package** is the concrete deployable application that you actually run in production.


