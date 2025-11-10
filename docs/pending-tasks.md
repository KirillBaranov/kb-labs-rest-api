# KB Labs REST API - Pending Tasks

## ✅ Completed

- [x] API Contracts - Shared schemas via `@kb-labs/api-contracts`
- [x] Core Services - Business logic (Audit, Release, DevLink, etc.)
- [x] Adapters - CLI, Storage, Queue, Auth
- [x] REST API App - Fastify routes, middleware, plugins
- [x] Envelope Middleware - Unified response format
- [x] Error Handling - Standardized error codes and mapping
- [x] Idempotency - `Idempotency-Key` header support
- [x] SSE Events - Real-time job event streaming
- [x] Health Endpoints - `/health` (snapshot) and `/ready`
- [x] CORS Profiles - Dev, preview, prod configurations
- [x] Rate Limiting - Global rate limiting
- [x] Security Headers - HSTS, X-Frame-Options, etc.
- [x] Caching - ETag/Last-Modified support
- [x] Mock Mode - Global and per-request
- [x] CLI Sandboxing - Command whitelist, CWD restrictions
- [x] Path Validation - Path traversal protection in storage
- [x] Job Cancellation - `POST /jobs/:jobId/cancel` endpoint
- [x] Concurrency Limits - Per-kind job limits
- [x] Documentation - README, examples, architecture
- [x] Contract Tests - Response validation via `@kb-labs/api-contracts`
- [x] Integration Tests - REST API ↔ Studio compatibility
- [x] E2E Tests - Full flow: Studio → REST API → CLI
- [x] OpenAPI - Spec generation (basic)

## 🚧 Pending Enhancements

### 1. Job Retry Policy ✅

**Status**: ✅ **COMPLETED**

All tasks completed. See [Completion Checklist](./completion-checklist.md#1-job-retry-policy-).

### 2. Job TTL and Cleanup ✅

**Status**: ✅ **COMPLETED**

All tasks completed. See [Completion Checklist](./completion-checklist.md#2-job-ttl-and-cleanup-).

### 3. Enhanced Observability ✅

**Status**: ✅ **COMPLETED**

All tasks completed. See [Completion Checklist](./completion-checklist.md#4-enhanced-observability-).

### 4. Enhanced CLI Sandboxing ✅

**Status**: ✅ **COMPLETED**

All tasks completed. See [Completion Checklist](./completion-checklist.md#6-enhanced-cli-sandboxing-).

### 5. Docker Enhancement ✅

**Status**: ✅ **COMPLETED**

All tasks completed. See [Completion Checklist](./completion-checklist.md#5-docker-enhancement-) and [Docker Guide](./docker.md).

### 6. Enhanced Job Executor ⚠️

**Status**: Basic executor exists, needs retry and TTL

**Tasks**:
- [ ] Implement retry policy (see #1)
- [ ] Add job TTL tracking (see #2)
- [ ] Add job progress callbacks
- [ ] Add job timeout handling (currently handled by CLI adapter)
- [ ] Add job cancellation signal handling

**Files to Update**:
- `packages/rest-api-core/src/jobs/executor.ts`

### 7. Per-Route Rate Limiting ⚠️

**Status**: Middleware created, not fully integrated

**Tasks**:
- [ ] Integrate per-route rate limiting with `@fastify/rate-limit`
- [ ] Configure route-specific limits
- [ ] Add rate limit headers (`X-RateLimit-*`)
- [ ] Add tests for rate limiting

**Files to Update**:
- `apps/rest-api/src/middleware/rate-limit-routes.ts`
- `apps/rest-api/src/plugins/index.ts` (register)

### 8. Test Coverage ⚠️

**Status**: Basic tests exist, needs expansion

**Tasks**:
- [ ] Add tests for retry scenarios
- [ ] Add tests for TTL cleanup
- [ ] Add tests for rate limiting
- [ ] Add tests for enhanced CLI sandboxing
- [ ] Add load tests
- [ ] Add fault injection tests (timeouts, SIGTERM, queue overload)

**Files to Create**:
- `apps/rest-api/src/__tests__/load/`
- `apps/rest-api/src/__tests__/fault-injection/`

## 🔮 Future Enhancements (Post-MVP)

### Storage Adapters
- [ ] S3 Storage Adapter implementation
- [ ] Database storage for job metadata

### Queue Adapters
- [ ] BullMQ adapter (Redis-backed persistent queue)
- [ ] Redis adapter for job events

### Authentication
- [ ] JWT auth adapter
- [ ] API Key auth adapter
- [ ] RBAC implementation

### Advanced Features
- [ ] Job scheduling (cron-like)
- [ ] Job dependencies (DAG)
- [ ] Job webhooks (callbacks on completion)
- [ ] Job templates
- [ ] Job replay

## 📊 Priority

1. **High Priority**:
   - Job Retry Policy (#1)
   - Job TTL and Cleanup (#2)
   - Enhanced Observability (#3)

2. **Medium Priority**:
   - Enhanced CLI Sandboxing (#4)
   - Per-Route Rate Limiting (#7)
   - Test Coverage (#8)

3. **Low Priority**:
   - Docker Enhancement (#5)
   - Enhanced Job Executor (#6) - overlaps with #1 and #2

