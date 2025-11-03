# KB Labs REST API - Architecture

## Overview

KB Labs REST API is built using **ports and adapters** (hexagonal) architecture, providing:

- **Loose Coupling** — Business logic separated from infrastructure
- **Testability** — Easy to mock adapters for testing
- **Extensibility** — Swap adapters (queue, storage, auth) without changing business logic

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     REST API Layer                      │
│  (Fastify routes, middleware, plugins)                  │
└────────────────┬────────────────────────────────────────┘
                  │
┌─────────────────▼──────────────────────────────────────┐
│                   Services Layer                        │
│  (AuditService, ReleaseService, DevlinkService, etc.)  │
└────┬────────────┬────────────┬────────────┬────────────┘
     │            │            │            │
┌────▼────┐  ┌───▼────┐  ┌────▼────┐  ┌───▼────┐
│ CLI Port│  │Storage │  │Queue    │  │Auth    │
│         │  │Port    │  │Port     │  │Port    │
└────┬────┘  └───┬────┘  └────┬────┘  └───┬────┘
     │          │            │            │
┌────▼──────────▼────────────▼────────────▼───────┐
│            Adapters Layer                        │
│  ExecaCliAdapter, FsStorageAdapter,             │
│  MemoryQueueAdapter, NoneAuthAdapter            │
└──────────────────────────────────────────────────┘
```

## Components

### 1. REST API Layer (`apps/rest-api`)

- **Routes** — HTTP endpoint handlers
- **Middleware** — Envelope wrapping, error handling, caching, security
- **Plugins** — CORS, rate limiting, request ID

### 2. Services Layer (`packages/rest-api-core/src/services`)

- **AuditService** — Business logic for audit operations
- **ReleaseService** — Business logic for release operations
- **DevlinkService** — Business logic for devlink operations
- **MindService** — Business logic for mind operations
- **AnalyticsService** — Business logic for analytics operations

Services depend on **ports** (interfaces), not concrete implementations.

### 3. Ports (`packages/rest-api-core/src/ports`)

Interfaces that define contracts:

- **CliPort** — Execute CLI commands
- **StoragePort** — Store/retrieve artifacts
- **QueuePort** — Manage job queue
- **AuthPort** — Authentication and authorization

### 4. Adapters (`packages/rest-api-core/src/adapters`)

Concrete implementations:

- **ExecaCliAdapter** — Execute `kb-labs-cli` commands via `execa`
- **FsStorageAdapter** — File system storage (`.kb/rest/`)
- **MemoryQueueAdapter** — In-memory job queue (MVP)
- **NoneAuthAdapter** — No authentication (MVP)

Future adapters:
- **BullMQAdapter** — Redis-backed job queue
- **S3StorageAdapter** — S3 storage
- **JwtAuthAdapter** — JWT authentication

### 5. Contracts (`@kb-labs/api-contracts`)

Shared schemas and types:

- **Envelope** — `{ ok, data, meta }` response format
- **Page<T>** — Pagination structure
- **Error** — Standardized error format
- **Domain Schemas** — Audit, Release, DevLink, etc.

## Data Flow

### Request Flow

```
1. HTTP Request → Fastify
2. Middleware (security, request ID, mock mode)
3. Route Handler → Service
4. Service → Port (interface)
5. Adapter (implementation)
6. External System (CLI, File System, Queue)
7. Response ← Adapter
8. Response ← Service
9. Envelope Middleware → Wrap response
10. HTTP Response
```

### Job Execution Flow

```
1. POST /audit/runs → AuditService.createRun()
2. AuditService → QueuePort.enqueue()
3. MemoryQueueAdapter → Store job metadata
4. Job Executor (background) → CliPort.execute()
5. ExecaCliAdapter → Execute `kb audit run ...`
6. Store results → StoragePort.write()
7. Update job status → QueuePort.updateStatus()
8. Emit events → QueuePort.emitEvent()
9. SSE Client ← Receive events
```

## Configuration

Configuration is loaded via `loadRestApiConfig()`:

1. **Defaults** — Hardcoded defaults in `config/loader.ts`
2. **File Config** — `kb-labs.config.json` or `kb-labs.config.yaml`
3. **Environment** — `KB_REST_*` environment variables
4. **CLI Overrides** — Programmatic overrides

## Error Handling

### Error Flow

```
1. Error occurs (service, adapter, validation)
2. Error mapped to ApiError format
3. Error handler middleware catches
4. Error envelope created
5. HTTP response with error envelope
```

### Error Codes

- `E_VALIDATION` — Validation errors
- `E_NOT_FOUND` — Resource not found
- `E_TOOL_AUDIT` — Audit tool failure
- `E_TOOL_RELEASE` — Release tool failure
- `E_TIMEOUT` — Command timeout
- `E_RATE_LIMIT` — Rate limit exceeded
- `E_INTERNAL` — Internal server error

## Security

### CLI Sandboxing

- **Command Whitelist** — Only allowed commands can be executed
- **CWD Restriction** — Commands run in restricted directory
- **Timeout Enforcement** — Commands killed after timeout
- **Argument Validation** — Arguments validated before execution

### API Security

- **Security Headers** — HSTS, X-Frame-Options, etc.
- **CORS** — Configurable per environment (dev, preview, prod)
- **Rate Limiting** — Per-IP and per-route limits
- **Input Validation** — Zod schema validation

## Extensibility

### Adding a New Tool

1. **Add CLI Command** — Add to `allowedCommands` in config
2. **Create Service** — `packages/rest-api-core/src/services/NewToolService.ts`
3. **Create Routes** — `apps/rest-api/src/routes/newtool.ts`
4. **Add Contracts** — `@kb-labs/api-contracts` schemas
5. **Register Routes** — Add to `apps/rest-api/src/routes/index.ts`

### Adding a New Adapter

1. **Implement Port** — Create adapter class implementing port interface
2. **Register Adapter** — Add to `apps/rest-api/src/services/index.ts`
3. **Configure** — Add driver option to config schema

## Testing Strategy

- **Unit Tests** — Test services with mocked ports
- **Contract Tests** — Validate API responses against `@kb-labs/api-contracts`
- **Integration Tests** — Test full flow (REST API → Service → Adapter)
- **E2E Tests** — Test Studio → REST API → CLI

## Job Lifecycle

### Job Execution with Retry

```
1. POST /audit/runs → Enqueue job
2. Job Executor → Execute job
3. If job fails:
   a. Check retry count < maxRetries
   b. Calculate backoff delay (fixed or exponential)
   c. Emit job.retry event via SSE
   d. Wait for backoff delay
   e. Retry job execution
4. If max retries exceeded → Mark as failed
5. If job succeeds → Mark as completed
```

### Job Cleanup

Background task runs periodically to clean up expired jobs:

```
1. Cleanup task runs (default: every 1 hour)
2. Find jobs older than TTL (default: 24 hours)
3. Delete job metadata from queue
4. Optionally cleanup associated artifacts
5. Log cleanup metrics
```

### Job Cancellation

```
1. POST /jobs/:jobId/cancel
2. Check job status (must be queued or running)
3. If running:
   a. Find active process by jobId
   b. Kill process (SIGTERM)
4. Update job status to "cancelled"
5. Emit job.cancelled event via SSE
6. Return updated job metadata
```

## Metrics Collection

### Metrics Types

1. **Request Metrics**:
   - Total requests count
   - Requests by method (GET, POST, etc.)
   - Requests by status (2xx, 4xx, 5xx)
   - Requests by route

2. **Latency Metrics**:
   - Min, max, average latency
   - Total latency sum
   - Request count

3. **Error Metrics**:
   - Total errors
   - Errors by code (E_VALIDATION, E_TOOL_AUDIT, etc.)

4. **Job Metrics**:
   - Queued jobs count
   - Running jobs count
   - Completed jobs count
   - Failed jobs count

### Metrics Endpoints

- `GET /metrics` — Prometheus format
- `GET /metrics/json` — JSON format

## Deployment

### Docker

See [Docker Guide](./docker.md) for detailed deployment instructions.

```bash
# Build image
docker build -t kb-labs-rest-api:latest .

# Run with Docker Compose
docker-compose up -d
```

### Environment Variables

See [README.md](../README.md#configuration) for all configuration options.

