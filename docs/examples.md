# KB Labs REST API - Examples

## Basic Usage

### Health Check

```bash
curl http://localhost:3001/api/v1/health/live
```

Response:
```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "node": "v20.10.0",
    "uptimeSec": 3600
  },
  "meta": {
    "requestId": "01K92CXQTGV3BV7A884XW1JM2Y",
    "durationMs": 5,
    "apiVersion": "1.0.0"
  }
}
```

### Create Audit Run

```bash
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "packages/*",
    "strict": true,
    "profile": "frontend"
  }'
```

Response:
```json
{
  "ok": true,
  "data": {
    "jobId": "01K92CXQTGV3BV7A884XW1JM2Y",
    "runId": "01K92CXQTGV3BV7A884XW1JM2Z"
  },
  "meta": {
    "requestId": "01K92CXQTGV3BV7A884XW1JM2X",
    "durationMs": 45,
    "apiVersion": "1.0.0"
  }
}
```

### Get Job Status

```bash
curl http://localhost:3001/api/v1/jobs/01K92CXQTGV3BV7A884XW1JM2Y
```

Response:
```json
{
  "ok": true,
  "data": {
    "jobId": "01K92CXQTGV3BV7A884XW1JM2Y",
    "runId": "01K92CXQTGV3BV7A884XW1JM2Z",
    "status": "running",
    "kind": "audit.run",
    "createdAt": "2025-01-15T10:00:00Z",
    "startedAt": "2025-01-15T10:00:05Z",
    "progress": 50
  },
  "meta": {
    "requestId": "01K92CXQTGV3BV7A884XW1JM2W",
    "durationMs": 2,
    "apiVersion": "1.0.0"
  }
}
```

### Subscribe to Job Events (SSE)

```bash
curl -N http://localhost:3001/api/v1/jobs/01K92CXQTGV3BV7A884XW1JM2Y/events
```

Response stream:
```
data: {"type":"job.queued","jobId":"01K92CXQTGV3BV7A884XW1JM2Y","timestamp":"2025-01-15T10:00:00Z"}
data: {"type":"job.started","jobId":"01K92CXQTGV3BV7A884XW1JM2Y","timestamp":"2025-01-15T10:00:05Z","data":{"status":"running"}}
data: {"type":"job.progress","jobId":"01K92CXQTGV3BV7A884XW1JM2Y","timestamp":"2025-01-15T10:00:10Z","data":{"progress":50}}
data: {"type":"job.finished","jobId":"01K92CXQTGV3BV7A884XW1JM2Y","timestamp":"2025-01-15T10:00:30Z","data":{"status":"completed"}}
```

### Idempotency

```bash
# First request
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Idempotency-Key: my-unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{"scope": "packages/*"}'

# Second request with same key - returns same jobId
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Idempotency-Key: my-unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{"scope": "packages/*"}'
```

### Error Handling

```bash
# Invalid request
curl -X POST http://localhost:3001/api/v1/audit/runs \
  -H "Content-Type: application/json" \
  -d '{"scope": 123}'
```

Response:
```json
{
  "ok": false,
  "error": {
    "code": "E_VALIDATION",
    "message": "Invalid input",
    "details": {
      "field": "scope",
      "expected": "string"
    },
    "traceId": "01K92CXQTGV3BV7A884XW1JM2V"
  },
  "meta": {
    "requestId": "01K92CXQTGV3BV7A884XW1JM2V",
    "durationMs": 10,
    "apiVersion": "1.0.0"
  }
}
```

## Integration with Studio

### Using Data Client

```typescript
import { createDataSources } from '@kb-labs/data-client';

const sources = createDataSources({
  mode: 'http',
  baseUrl: '/api', // Use proxy in dev
});

// Run audit
const result = await sources.audit.runAudit({
  scope: 'packages/*',
  strict: true,
});

// Get job status
const job = await sources.audit.getJob(result.jobId);

// Use SSE hook
import { useJobEvents } from '@kb-labs/data-client';

function JobMonitor({ jobId }: { jobId: string }) {
  const { events, isConnected } = useJobEvents(jobId, {
    onEvent: (event) => {
      console.log('Job event:', event);
    },
    onComplete: () => {
      console.log('Job completed!');
    },
  });

  return <div>Status: {events[events.length - 1]?.type}</div>;
}
```

## Advanced Usage

### Cursor Pagination

```bash
# First page
curl "http://localhost:3001/api/v1/audit/runs?limit=10"

# Next page
curl "http://localhost:3001/api/v1/audit/runs?limit=10&cursor=01K92CXQTGV3BV7A884XW1JM2Z"
```

### Filtering

```bash
# Filter by status
curl "http://localhost:3001/api/v1/audit/runs?status=completed&limit=10"

# Filter jobs
curl "http://localhost:3001/api/v1/jobs?status=running&kind=audit.run"
```

### Caching

```bash
# First request
curl http://localhost:3001/api/v1/audit/report/latest

# Response includes ETag
# ETag: "abc123"

# Subsequent request with If-None-Match
curl -H "If-None-Match: \"abc123\"" \
  http://localhost:3001/api/v1/audit/report/latest

# Returns 304 Not Modified
```

### Mock Mode

```bash
# Per-request mock
curl -H "KB-Mock: true" \
  http://localhost:3001/api/v1/audit/summary

# Global mock mode (via env)
KB_REST_MOCK_MODE=true pnpm dev
```

### Job Cancellation

```bash
# Cancel a running job
curl -X POST http://localhost:3001/api/v1/jobs/01K92CXQTGV3BV7A884XW1JM2Y/cancel
```

Response:
```json
{
  "ok": true,
  "data": {
    "jobId": "01K92CXQTGV3BV7A884XW1JM2Y",
    "runId": "01K92CXQTGV3BV7A884XW1JM2Z",
    "status": "cancelled",
    "kind": "audit.run",
    "createdAt": "2025-01-15T10:00:00Z",
    "finishedAt": "2025-01-15T10:00:15Z",
    "error": "Job was cancelled"
  },
  "meta": {
    "requestId": "01K92CXQTGV3BV7A884XW1JM2X",
    "durationMs": 10,
    "apiVersion": "1.0.0"
  }
}
```

### Metrics

```bash
# Prometheus format
curl http://localhost:3001/api/v1/metrics

# JSON format
curl http://localhost:3001/api/v1/metrics/json
```

Response (JSON):
```json
{
  "ok": true,
  "data": {
    "requests": {
      "total": 1234,
      "byMethod": {
        "GET": 1000,
        "POST": 234
      },
      "byStatus": {
        "2xx": 1100,
        "4xx": 100,
        "5xx": 34
      },
      "byRoute": {
        "/health/live": 500,
        "/audit/runs": 234
      }
    },
    "latency": {
      "total": 50000,
      "count": 1234,
      "min": 2,
      "max": 5000,
      "average": 40.5
    },
    "errors": {
      "total": 134,
      "byCode": {
        "E_VALIDATION": 100,
        "E_TOOL_AUDIT": 34
      }
    },
    "jobs": {
      "queued": 5,
      "running": 2,
      "completed": 1000,
      "failed": 50
    }
  },
  "meta": {
    "requestId": "01K92CXQTGV3BV7A884XW1JM2W",
    "durationMs": 5,
    "apiVersion": "1.0.0"
  }
}
```

### Job Retry Events (SSE)

```bash
# Subscribe to job events including retry events
curl -N http://localhost:3001/api/v1/jobs/01K92CXQTGV3BV7A884XW1JM2Y/events
```

Response stream:
```
data: {"type":"job.queued","jobId":"...","timestamp":"..."}
data: {"type":"job.started","jobId":"...","timestamp":"..."}
data: {"type":"job.retry","jobId":"...","timestamp":"...","data":{"retryCount":1,"delay":1000,"error":"Temporary failure"}}
data: {"type":"job.started","jobId":"...","timestamp":"..."}
data: {"type":"job.finished","jobId":"...","timestamp":"...","data":{"status":"completed"}}
```

