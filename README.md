# KB Labs REST API (@kb-labs/rest-api)

> **REST API layer for KB Labs CLI tools.** Unified HTTP interface for audit, release, devlink, mind, and analytics commands.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs REST API provides a production-ready HTTP layer over KB Labs CLI tools, enabling web applications and other services to interact with the KB Labs ecosystem through a unified REST interface. It bridges the gap between CLI tools and web-based UIs, making all KB Labs functionality accessible via HTTP.

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

# Queue configuration
KB_REST_QUEUE_DRIVER=memory  # memory | bullmq

# Storage configuration
KB_REST_STORAGE_DRIVER=fs  # fs | s3

# Mock mode (for testing)
KB_REST_MOCK_MODE=false
```

### Basic Usage

#### Health Check

```bash
curl http://localhost:3001/api/v1/health/live
```

#### Create Audit Run

```bash
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Content-Type: application/json" \
  -d '{"scope": "packages/*"}'
```

#### Get Job Status

```bash
curl http://localhost:3001/api/v1/jobs/{jobId}
```

## ✨ Features

- **Unified API**: Single REST interface for all CLI tools (audit, release, devlink, mind, analytics)
- **Job Queue**: Asynchronous task execution with status tracking and retry policies
- **Real-time Updates**: SSE (Server-Sent Events) for job progress monitoring
- **Type Safety**: Shared contracts via `@kb-labs/api-contracts` with Zod schema validation
- **Production Ready**: Security headers, CORS, rate limiting, caching, comprehensive error handling
- **Idempotency**: Support for `Idempotency-Key` header for consistent results
- **Mock Mode**: Per-request or global mock mode for testing
- **Observability**: Structured logging, metrics, and request tracing

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
- **`packages/rest-api-core/`** - Core library with ports, adapters, and services
- **`docs/`** - Comprehensive documentation including ADRs, guides, and examples

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/rest-api-core](./packages/rest-api-core/) | Core library with ports (interfaces), adapters (implementations), and services (business logic) |
| [@kb-labs/rest-api-app](./apps/rest-api/) | Fastify application server |

### Package Details

**@kb-labs/rest-api-core** provides the core library architecture:
- **Ports**: Interfaces (CLI, Storage, Queue, Auth)
- **Adapters**: Implementations (ExecaCliAdapter, FsStorageAdapter, MemoryQueueAdapter)
- **Services**: Business logic (AuditService, ReleaseService, DevLinkService, MindService, AnalyticsService)
- **Contracts**: Request/response validation via Zod schemas

**@kb-labs/rest-api-app** provides the Fastify application:
- Route handlers for all API endpoints
- Middleware (security, caching, rate limiting, metrics)
- Server bootstrap and configuration
- OpenAPI documentation generation

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
- **KB_REST_QUEUE_DRIVER**: Queue driver (memory | bullmq)
- **KB_REST_STORAGE_DRIVER**: Storage driver (fs | s3)
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

- **Development**: `http://localhost:3001/api/v1`
- **OpenAPI Spec**: `http://localhost:3001/api/v1/openapi.json`
- **Swagger UI** (dev only): `http://localhost:3001/api/v1/docs`

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
    "code": "E_TOOL_AUDIT",
    "message": "Audit failed",
    "details": { /* error details */ },
    "cause": "CLI exit code: 1",
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

#### System

- `GET /health/live` — Health check (always returns 200)
- `GET /health/ready` — Readiness check (200 if ready, 503 if not)
- `GET /info` — System information
- `GET /info/capabilities` — Available adapters and commands
- `GET /info/config` — Redacted configuration

#### Audit

- `POST /audit/runs` — Create audit run (returns `jobId` and `runId`)
- `GET /audit/runs` — List audit runs (cursor pagination)
- `GET /audit/runs/:runId` — Get audit run status
- `GET /audit/summary` — Get audit summary
- `GET /audit/report/latest` — Get latest audit report

#### Jobs

- `GET /jobs/:jobId` — Get job status
- `GET /jobs/:jobId/logs` — Get job logs
- `GET /jobs/:jobId/events` — Subscribe to job events (SSE)
- `POST /jobs/:jobId/cancel` — Cancel a running job

#### Release

- `POST /release/preview` — Preview release plan
- `POST /release/runs` — Create release run
- `GET /release/runs/:runId` — Get release run status
- `GET /release/changelog` — Get changelog

### Advanced Features

#### Idempotency

Support `Idempotency-Key` header to ensure consistent results:

```bash
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Idempotency-Key: my-unique-key" \
  -H "Content-Type: application/json" \
  -d '{"scope": "packages/*"}'
```

#### Server-Sent Events (SSE)

Subscribe to job events in real-time:

```bash
curl -N http://localhost:3001/api/v1/jobs/{jobId}/events
```

#### Caching

API supports ETag and Last-Modified headers:

```bash
curl -H "If-None-Match: \"abc123\"" \
  http://localhost:3001/api/v1/audit/report/latest
```

## 🔒 Security

- **Security Headers**: HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- **CORS**: Configurable profiles (dev, preview, prod)
- **Rate Limiting**: Per-IP and per-route limits
- **Enhanced CLI Sandboxing**:
  - Command whitelist validation
  - Argument sanitization (prevents injection attacks)
  - CWD restrictions (within repo root)
  - Path traversal protection
  - Environment variable blocklist (PATH, LD_*, etc.)
  - Command binary validation
- **Input Validation**: Zod schema validation for all requests

## 📊 Observability

- **Structured Logging**: Pino logger with correlation IDs
- **Request ID**: `X-Request-Id` header for request tracking
- **Metrics**: Request, latency, error, and job metrics
  - `GET /metrics` — Prometheus format
  - `GET /metrics/json` — JSON format
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
