# KB Labs REST API - Features

## 🎯 Core Features

### Job Queue

- **Asynchronous Execution** — Jobs are enqueued and executed in background
- **Status Tracking** — Real-time job status updates
- **Concurrency Limits** — Per-kind job limits (e.g., max 2 audit jobs concurrently)
- **Priority Support** — Jobs can be prioritized (higher priority runs first)

### Retry Policies

**Automatic retry on failure** with configurable backoff strategies:

- **Fixed Backoff** — Constant delay between retries
- **Exponential Backoff** — Exponentially increasing delay (2^retryCount * baseDelay)
- **Max Retries** — Configurable maximum retry attempts
- **Retry Events** — SSE events emitted on each retry attempt

**Configuration**:
```json
{
  "restApi": {
    "queue": {
      "retry": {
        "maxRetries": 3,
        "backoff": {
          "type": "exponential",  // or "fixed"
          "delay": 1000  // milliseconds
        }
      }
    }
  }
}
```

**Example**:
```bash
# Job fails → retries with exponential backoff
# Retry 1: delay 1000ms
# Retry 2: delay 2000ms
# Retry 3: delay 4000ms
# If still fails → job marked as failed
```

### Job TTL and Cleanup

**Automatic cleanup** of expired jobs and artifacts:

- **TTL (Time To Live)** — Jobs older than TTL are automatically deleted
- **Periodic Cleanup** — Background task runs at configured interval
- **Artifact Cleanup** — Optionally cleanup associated artifacts (reports, logs)
- **Graceful Shutdown** — Cleanup task stops on SIGTERM/SIGINT

**Configuration**:
```json
{
  "restApi": {
    "queue": {
      "cleanup": {
        "enabled": true,
        "intervalSec": 3600,  // Check every hour
        "ttlSec": 86400,  // Keep jobs for 24 hours
        "cleanupArtifacts": true  // Also cleanup artifacts
      }
    }
  }
}
```

### Job Cancellation

**Cancel running or queued jobs**:

- **Cancel Endpoint** — `POST /jobs/:jobId/cancel`
- **Process Termination** — Running CLI processes are killed (SIGTERM)
- **Status Update** — Job status updated to "cancelled"
- **Event Emission** — `job.cancelled` event emitted via SSE

**Example**:
```bash
curl -X POST http://localhost:3001/api/v1/jobs/01K92CXQTGV3BV7A884XW1JM2Y/cancel
```

### Idempotency

**Ensure consistent results** for repeated requests:

- **Idempotency-Key Header** — Use `Idempotency-Key` header to ensure idempotent requests
- **Job Deduplication** — Same key returns same jobId
- **Automatic Tracking** — Keys are tracked and mapped to jobIds

**Example**:
```bash
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Idempotency-Key: my-unique-key" \
  -H "Content-Type: application/json" \
  -d '{"scope": "packages/*"}'

# Same request with same key → returns same jobId
```

### Server-Sent Events (SSE)

**Real-time job updates** via SSE:

- **Event Types**:
  - `job.queued` — Job added to queue
  - `job.started` — Job execution started
  - `job.progress` — Job progress update
  - `job.retry` — Job retry attempt
  - `job.finished` — Job completed successfully
  - `job.failed` — Job failed
  - `job.cancelled` — Job cancelled
  - `job.timeout` — Job timed out

- **Polling Fallback** — Falls back to polling if SSE not supported

**Example**:
```bash
curl -N http://localhost:3001/api/v1/jobs/01K92CXQTGV3BV7A884XW1JM2Y/events
```

### Metrics and Observability

**Comprehensive metrics collection**:

- **Request Metrics** — Count, latency, errors by method/status/route
- **Job Metrics** — Queue size, running, completed, failed jobs
- **Error Metrics** — Errors by code
- **Prometheus Format** — `/metrics` endpoint (Prometheus format)
- **JSON Format** — `/metrics/json` endpoint (JSON format)

**Example**:
```bash
# Prometheus format
curl http://localhost:3001/api/v1/metrics

# JSON format
curl http://localhost:3001/api/v1/metrics/json
```

### Caching

**HTTP caching support**:

- **ETag** — Entity tags for cache validation
- **Last-Modified** — Last modification time
- **304 Not Modified** — Returned when cache is valid

**Example**:
```bash
# First request
curl http://localhost:3001/api/v1/audit/report/latest
# Response: ETag: "abc123"

# Subsequent request with If-None-Match
curl -H "If-None-Match: \"abc123\"" \
  http://localhost:3001/api/v1/audit/report/latest
# Response: 304 Not Modified
```

### Mock Mode

**Development and testing support**:

- **Per-Request** — Enable via `KB-Mock` header
- **Global** — Enable via `KB_REST_MOCK_MODE` environment variable
- **Fixtures** — Returns mock data for testing

**Example**:
```bash
# Per-request mock
curl -H "KB-Mock: true" \
  http://localhost:3001/api/v1/audit/summary

# Global mock mode
KB_REST_MOCK_MODE=true pnpm dev
```

## 🔒 Security Features

### Enhanced CLI Sandboxing

**Comprehensive security** for CLI command execution:

1. **Command Whitelist** — Only allowed commands can be executed
2. **Argument Validation**:
   - Dangerous character detection (`;`, `|`, `&`, `$`)
   - Command injection prevention (`` ` ``, `$()`, `${}`)
   - Path traversal protection (`..`)
   - Pattern whitelist validation
3. **Working Directory Validation** — Commands can only run within repo root
4. **Artifact Path Validation** — Path traversal protection for artifact paths
5. **Environment Variable Blocklist** — Dangerous vars blocked (PATH, LD_*, etc.)
6. **Command Binary Validation** — Only simple command names allowed (no path traversal)

**Example**:
```bash
# Valid command
kb audit --json --scope=packages/*

# Invalid (blocked)
kb rm -rf /  # Command not in whitelist
kb audit --scope="../../../etc/passwd"  # Path traversal blocked
kb audit --scope="packages/*; rm -rf /"  # Dangerous character blocked
```

### Security Headers

**Standard security headers**:
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options`
- `X-Content-Type-Options`
- `X-XSS-Protection`
- `Referrer-Policy`
- `Content-Security-Policy`

### CORS Profiles

**Configurable CORS** per environment:
- **Dev** — Relaxed CORS for development
- **Preview** — Moderate CORS for staging
- **Prod** — Strict CORS for production

### Rate Limiting

**Multiple rate limiting strategies**:
- **Global** — Per-IP rate limiting
- **Per-Route** — Route-specific limits (e.g., stricter limits for run endpoints)
- **Configurable** — Limits configurable via config

## 📊 Configuration

### Queue Configuration

```json
{
  "restApi": {
    "queue": {
      "driver": "memory",  // or "bullmq"
      "maxConcurrent": {
        "audit": 2,
        "release": 1,
        "devlink": 2
      },
      "defaultPriority": 0,
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

### CLI Configuration

```json
{
  "restApi": {
    "cli": {
      "bin": "pnpm",
      "prefix": ["kb"],
      "timeoutSec": 900,
      "allowedCommands": ["audit", "release", "devlink", "mind", "analytics"]
    }
  }
}
```

### Storage Configuration

```json
{
  "restApi": {
    "storage": {
      "driver": "fs",  // or "s3"
      "baseDir": ".kb/rest"
    }
  }
}
```

## 🔗 Integration

### Studio Integration

The REST API integrates seamlessly with `kb-labs-studio`:

- **Data Client** — `@kb-labs/data-client` handles HTTP communication
- **Envelope Unwrapping** — Automatic envelope unwrapping in data client
- **SSE Support** — `useJobEvents` hook for real-time updates
- **Error Mapping** — Automatic error code mapping
- **Health Banner** — Studio shows health status and auto-fallback to mocks

### CLI Integration

The REST API executes `kb-labs-cli` commands:

- **Command Execution** — Via `execa` adapter
- **JSON Output** — CLI commands use `--json` flag
- **Output Parsing** — JSON output parsed and stored as artifacts
- **Error Mapping** — CLI exit codes mapped to API error codes


