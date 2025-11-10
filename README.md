# KB Labs REST API (@kb-labs/rest-api)

> **Plugin-first REST API gateway for KB Labs.** Serves health, registry, OpenAPI, and metrics endpoints powered entirely by discovered plugins.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs REST API now exposes a thin HTTP layer that reflects the capabilities of discovered plugins. Instead of hard-coded audit or release flows, the server discovers manifests at runtime, mounts their REST handlers, and presents shared system endpoints (health, plugin registry, OpenAPI, metrics) that Studio and other clients can consume.

This keeps the API aligned with the plugin ecosystem, removes legacy surface area, and keeps the deployment lightweight—no background job queue, no bespoke services, just plugin-powered routes plus common infrastructure middleware.

The project solves the problem of integrating CLI tools into web applications by providing a secure, scalable, and type-safe REST API layer. It enables real-time job execution, status tracking, and integration with modern web frameworks while maintaining security through enhanced sandboxing and validation.

This project is part of the **@kb-labs** ecosystem and integrates seamlessly with KB Labs CLI, Core, and Studio web UI.

## 🚀 Quick Start

### Installation

```bash
# From KB Labs monorepo root
cd kb-labs-rest-api
pnpm install
pnpm build
```

### Development

```bash
# Start REST API server
cd apps/rest-api
pnpm dev

# Server will start on http://localhost:3001
# API base path: /api/v1
```

### Configuration

Create `.env` file or set environment variables:

```bash
# Server configuration
PORT=3001
KB_REST_BASE_PATH=/api/v1
KB_REST_API_VERSION=1.0.0

# CORS configuration
KB_REST_CORS_ORIGINS=http://localhost:3000,http://localhost:5173
KB_REST_CORS_PROFILE=dev  # dev | preview | prod

# Rate limit configuration
KB_REST_RATE_LIMIT_MAX=60
KB_REST_RATE_LIMIT_WINDOW=1 minute

# Mock mode (for testing)
KB_REST_MOCK_MODE=false
# Redis (optional, enables horizontal scaling via shared snapshots)
KB_REST_REDIS_URL=redis://localhost:6379
KB_REST_REDIS_NAMESPACE=kb
```

### Redis Integration

When `redis` is configured (either via env vars above or `rest.redis` in `kb-labs.config.json`), the REST API connects to Redis as a read-only consumer:

```
{
  "rest": {
    "redis": {
      "url": "redis://cache.internal:6379",
      "namespace": "kb"
    }
  }
}
```

CLI producers persist `kb.registry/1` snapshots to the same Redis instance and publish `kb:registry:changed`; REST subscribers replay snapshots from Redis on boot, so multiple REST nodes share the same data without re-running discovery.

### Basic Usage

#### Health Snapshot (`GET /health`)

```bash
curl http://localhost:3001/health
```

Response (schema `kb.health/1`):

```json
{
  "schema": "kb.health/1",
  "ts": "2025-11-08T10:20:32.123Z",
  "uptimeSec": 512,
  "version": {
    "kbLabs": "0.29.0",
    "cli": "0.29.0",
    "rest": "0.14.1",
    "studio": "0.20.0",
    "git": {
      "sha": "3f5c7ab",
      "dirty": false
    }
  },
  "registry": {
    "total": 8,
    "withRest": 5,
    "withStudio": 6,
    "errors": 0,
    "generatedAt": "2025-11-08T10:20:02.002Z",
    "expiresAt": "2025-11-08T10:21:02.002Z",
    "partial": false,
    "stale": false
  },
  "status": "healthy",
  "components": [
    {
      "id": "@kb-labs/mind",
      "version": "0.8.3",
      "restRoutes": 4,
      "studioWidgets": 5
    }
  ],
  "meta": {
    "source": "rest",
    "readiness": {
      "pluginRoutesMounted": true,
      "pluginRoutesCount": 12,
      "pluginRouteErrors": 0,
      "registryPartial": false,
      "registryStale": false,
      "pluginMounts": {
        "total": 12,
        "succeeded": 12,
        "failed": 0,
        "elapsedMs": 184.21
      }
    }
  }
}
```

> The same payload is available under the configured base path (e.g. `/api/v1/health` when `KB_REST_BASE_PATH=/api/v1`).

#### Readiness Probe (`GET /ready`)

```bash
curl -i http://localhost:3001/ready
```

Possible responses:

```json
{ "ready": true }
```

```json
{ "ready": false, "reason": "plugin_routes_not_mounted" }
```

#### Plugin Registry

```bash
curl http://localhost:3001/api/v1/plugins/registry
```

#### Aggregated OpenAPI

```bash
curl http://localhost:3001/openapi.json
```

#### Prometheus Metrics

```bash
curl http://localhost:3001/api/v1/metrics
```

Includes per-route latency histograms (`http_request_duration_ms_bucket`) and plugin mount counters (`kb_plugins_mount_total`, `kb_plugins_mount_failed`).

### Live Registry Stream (Server-Sent Events)

The REST API broadcasts registry and readiness updates over SSE:

- `GET /api/v1/events/registry`
  - `event: registry` — `{ schema:"kb.registry/1", rev, generatedAt, partial, stale, ttlMs, expiresAt }`
  - `event: health` — `{ schema:"kb.health/1", status, ready, reason, pluginsMounted, pluginsFailed }`
  - Append `?access_token=<token>` if the stream is protected behind an auth token (Studio does this automatically when `VITE_EVENTS_AUTH_TOKEN` is set)

Backed by Redis (`KB_REST_REDIS_URL`), so multiple REST nodes share the same snapshot without recomputing discovery.

Studio and other consumers can provide custom headers (e.g. bearer token) via `VITE_EVENTS_HEADERS` and `VITE_EVENTS_AUTH_TOKEN`.

## ✨ Features

- **Plugin-powered routing**: Mounts REST handlers straight from discovered plugin manifests (no hard-coded routes)
- **Studio-ready registry**: Exposes full manifest metadata for Studio and other clients via `/api/v1/plugins/registry`
- **Shared infrastructure**: CORS profiles, rate limiting, security headers, request envelope, and metrics baked in
- **Redis-backed cache**: Optional Redis configuration lets multiple REST instances consume the same CLI snapshot without re-running discovery
- **OpenAPI aggregation**: Merges OpenAPI fragments emitted by plugins into a single `/openapi.json`
- **Mock & diagnostics**: Per-request mock flag plus `/health` snapshot (`kb.health/1`) and `/ready` probe for automated monitoring

## 📁 Repository Structure

```
kb-labs-rest-api/
├── apps/
│   ├── rest-api/            # Fastify application (main server)
│   └── demo/                # Demo application
├── packages/
│   └── rest-api-core/       # Core library (ports, adapters, services)
├── docs/                    # Documentation
│   ├── adr/                  # Architecture Decision Records
│   ├── architecture.md      # System design
│   ├── examples.md          # API usage examples
│   └── docker.md            # Docker deployment guide
└── scripts/                 # Utility scripts
```

### Directory Descriptions

- **`apps/rest-api/`** - Fastify-based REST API server application
- **`apps/demo/`** - Demo application demonstrating API usage
- **`packages/rest-api-core/`** - Shared config loader, schema, and types for the REST API runtime
- **`docs/`** - Comprehensive documentation including ADRs, guides, and examples

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/rest-api-core](./packages/rest-api-core/) | Configuration loader and shared types for the REST API runtime |
| [@kb-labs/rest-api-app](./apps/rest-api/) | Fastify application server |

### Package Details

**@kb-labs/rest-api-core** provides:
- Zod schema + loader for REST API configuration
- Environment variable mapping helpers for deployments

**@kb-labs/rest-api-app** provides the Fastify application:
- Plugin discovery + dynamic route mounting
- Middleware (security, caching, rate limiting, metrics, envelope)
- Server bootstrap and configuration
- OpenAPI aggregation

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development mode for REST API server |
| `pnpm build` | Build all packages |
| `pnpm build:clean` | Clean and build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Run tests with coverage reporting |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint all code |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm format` | Format code with Prettier |
| `pnpm type-check` | TypeScript type checking |
| `pnpm check` | Run lint, type-check, and tests |
| `pnpm ci` | Full CI pipeline (clean, build, check) |
| `pnpm clean` | Clean build artifacts |
| `pnpm clean:all` | Clean all node_modules and build artifacts |

## 📋 Development Policies

- **Code Style**: ESLint + Prettier, TypeScript strict mode
- **Testing**: Vitest with contract tests, integration tests, and E2E tests
- **Versioning**: SemVer with automated releases through Changesets
- **Architecture**: Document decisions in ADRs (see `docs/adr/`)
- **API Design**: RESTful API with consistent envelope format
- **Security**: Enhanced CLI sandboxing, input validation, and security headers

## 🔧 Requirements

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

## ⚙️ Configuration

### Environment Variables

The REST API server can be configured via environment variables:

- **PORT**: Server port (default: 3001)
- **KB_REST_BASE_PATH**: API base path (default: `/api/v1`)
- **KB_REST_API_VERSION**: API version (default: `1.0.0`)
- **KB_REST_CORS_ORIGINS**: Comma-separated list of allowed CORS origins
- **KB_REST_CORS_PROFILE**: CORS profile (dev | preview | prod)
- **KB_REST_RATE_LIMIT_MAX**: Requests allowed per window (default: 60)
- **KB_REST_RATE_LIMIT_WINDOW**: Rate-limit window (default: `1 minute`)
- **KB_REST_REQUEST_TIMEOUT**: Per-request timeout milliseconds (default: 30000)
- **KB_REST_BODY_LIMIT**: Maximum request body size in bytes (default: 10485760)
- **KB_REST_REDIS_URL**: Redis connection string used for registry snapshots/pub-sub (e.g. `redis://localhost:6379`)
- **KB_REST_REDIS_NAMESPACE**: Redis namespace/prefix for keys and channels (default: `kb`)
- **KB_REST_MOCK_MODE**: Enable mock mode globally (true | false)

### Job Queue Configuration

Configure retry policies and cleanup in `kb-labs.config.json`:

```json
{
  "restApi": {
    "queue": {
      "retry": {
        "maxRetries": 3,
        "backoff": {
          "type": "exponential",
          "delay": 1000
        }
      },
      "cleanup": {
        "enabled": true,
        "intervalSec": 3600,
        "ttlSec": 86400,
        "cleanupArtifacts": true
      }
    }
  }
}
```

## 📚 API Documentation

### Base URL

- **HTTP host**: `http://localhost:3001`
- **API base path**: `/api/v1`
- **Aggregated OpenAPI**: `http://localhost:3001/openapi.json`
- **Per-plugin OpenAPI**: `http://localhost:3001/openapi/{pluginId}`

### Response Format

All responses use an envelope format:

```json
{
  "ok": true,
  "data": { /* response data */ },
  "meta": {
    "requestId": "01K...",
    "durationMs": 123,
    "apiVersion": "1.0.0"
  }
}
```

### Error Format

```json
{
  "ok": false,
  "error": {
    "code": "PLUGIN_HANDLER_ERROR",
    "message": "Plugin route failed",
    "details": { /* error details */ },
    "traceId": "01K..."
  },
  "meta": {
    "requestId": "01K...",
    "durationMs": 45,
    "apiVersion": "1.0.0"
  }
}
```

### Key Endpoints

#### Health & Diagnostics

- `GET /health` — Versioned snapshot (`kb.health/1`), always HTTP 200
- `GET /ready` — Readiness probe (`200` when ready, `503` with reason otherwise)

#### Plugin Registry & Discovery

- `GET /api/v1/plugins/registry` — Complete list of plugin manifests the API mounted

#### OpenAPI

- `GET /openapi.json` — Aggregated OpenAPI document combining all mounted plugins
- `GET /openapi/{pluginId}` — Per-plugin OpenAPI fragment

#### Metrics

- `GET /api/v1/metrics` — Prometheus format metrics
- `GET /api/v1/metrics/json` — JSON formatted metrics snapshot

#### Plugin Routes

Each plugin contributes its own REST handlers and base path via its manifest. Inspect `/api/v1/plugins/registry` for manifest metadata and mounted routes.

## 🔒 Security

- **Security Headers**: HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- **CORS**: Configurable profiles (dev, preview, prod)
- **Rate Limiting**: Per-IP and per-route limits
- **Input Validation**: Zod schema validation for all requests

## 📊 Observability

- **Structured Logging**: Pino logger with correlation IDs
- **Request ID**: `X-Request-Id` header for request tracking
- **Metrics**: Request, latency, error counters, and plugin mount stats
  - `GET /api/v1/metrics` — Prometheus format
  - `GET /api/v1/metrics/json` — JSON format
- **Server-Sent Events**: `/api/v1/events/registry` streams registry revisions and readiness changes for Studio auto-refresh
- **Error Tracking**: Full error envelope with traceId

## 📚 Documentation

- [Documentation Standard](./docs/DOCUMENTATION.md) - Full documentation guidelines
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [Architecture Decisions](./docs/adr/) - ADRs for this project

**Guides:**
- [Architecture](./docs/architecture.md) — System design and architecture
- [Examples](./docs/examples.md) — API usage examples
- [Docker Guide](./docs/docker.md) — Docker deployment guide
- [Compatibility Check](./docs/compatibility-check.md) — CLI → REST API → Studio compatibility
- [Completion Checklist](./docs/completion-checklist.md) — Feature completion status

**Integration:**
- [API Contracts](https://github.com/KirillBaranov/kb-labs-api-contracts/blob/main/packages/api-contracts/README.md) — Shared API contracts
- [Studio Integration](https://github.com/KirillBaranov/kb-labs-studio/blob/main/README.md) — Web UI integration

## 🔗 Related Packages

### Dependencies

- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities and infrastructure abstractions
- [@kb-labs/api-contracts](https://github.com/KirillBaranov/kb-labs-api-contracts) - Shared API contracts (Zod schemas)

### Used By

- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) - Web UI for KB Labs

### Ecosystem

- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

MIT © KB Labs

---

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.**
