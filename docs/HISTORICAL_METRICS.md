# Historical Metrics System

## Overview

The Historical Metrics System provides time-series data collection and storage for the Intelligence Dashboard. It enables predictive analytics, performance heatmaps, and historical trend analysis.

## Architecture

### Components

1. **`HistoricalMetricsCollector`** (`apps/rest-api/src/services/historical-metrics.ts`)
   - Background service that collects metrics snapshots every 5 seconds
   - Stores data in `platform.cache` with TTL-based retention
   - Provides query APIs for time-series and heatmap data

2. **Storage Strategy**
   - **Short-term** (1m-1h): Ring buffer in cache with configurable retention
   - **Heatmap aggregation**: Weekly patterns (7 days × 24 hours) with exponential moving average
   - **TTL-based cleanup**: Automatic expiration prevents memory bloat

3. **New Endpoints**
   - `GET /api/v1/observability/metrics/history` - Time-series data
   - `GET /api/v1/observability/metrics/heatmap` - Aggregated heatmap

## API Reference

### GET /api/v1/observability/metrics/history

Returns historical time-series metrics data.

**Query Parameters:**
```typescript
{
  metric: 'requests' | 'errors' | 'latency' | 'uptime';  // Required
  range: '1m' | '5m' | '10m' | '30m' | '1h';            // Required
  interval?: '5s' | '1m' | '5m';                        // Optional (default: '5s')
}
```

**Response:**
```typescript
{
  ok: true,
  data: Array<{ timestamp: number, value: number }>,
  meta: {
    source: 'historical-metrics-collector',
    metric: 'requests',
    range: '1h',
    interval: '5s',
    points: 720
  }
}
```

**Example:**
```bash
# Get last 30 minutes of request count (5-second granularity)
curl "http://localhost:5050/api/v1/observability/metrics/history?metric=requests&range=30m"

# Get last hour of latency, aggregated by 1-minute intervals
curl "http://localhost:5050/api/v1/observability/metrics/history?metric=latency&range=1h&interval=1m"
```

### GET /api/v1/observability/metrics/heatmap

Returns heatmap aggregated data for weekly patterns (7 days × 24 hours).

**Query Parameters:**
```typescript
{
  metric: 'latency' | 'errors' | 'requests';  // Required
  days?: 7 | 14 | 30;                         // Optional (default: 7)
}
```

**Response:**
```typescript
{
  ok: true,
  data: Array<{
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
    hour: 0-23,
    value: number
  }>,
  meta: {
    source: 'historical-metrics-collector',
    metric: 'latency',
    days: 7,
    cells: 168  // 7 days × 24 hours
  }
}
```

**Example:**
```bash
# Get weekly latency heatmap
curl "http://localhost:5050/api/v1/observability/metrics/heatmap?metric=latency"

# Get weekly request volume heatmap
curl "http://localhost:5050/api/v1/observability/metrics/heatmap?metric=requests"
```

## Configuration

The collector is configured in `apps/rest-api/src/routes/index.ts`:

```typescript
const historicalCollector = new HistoricalMetricsCollector(
  platform.cache,
  {
    intervalMs: 5000,                    // Collect every 5 seconds
    maxPoints: {
      '1m': 12,   // Last 1 minute:  12 points (5s interval)
      '5m': 60,   // Last 5 minutes: 60 points
      '10m': 120, // Last 10 minutes: 120 points
      '30m': 360, // Last 30 minutes: 360 points
      '1h': 720,  // Last 1 hour: 720 points
    },
    debug: process.env.NODE_ENV !== 'production',
  },
  server.log
);
```

### Environment Variables

- `NODE_ENV` - Set to `production` to disable debug logging
- `KB_STATE_DAEMON_URL` - State Broker daemon URL (default: `http://localhost:7777`)

## Storage Details

### Cache Keys

- `metrics:history:1m` - Last 1 minute (TTL: 2 minutes)
- `metrics:history:5m` - Last 5 minutes (TTL: 10 minutes)
- `metrics:history:10m` - Last 10 minutes (TTL: 20 minutes)
- `metrics:history:30m` - Last 30 minutes (TTL: 1 hour)
- `metrics:history:1h` - Last 1 hour (TTL: 2 hours)
- `metrics:heatmap:7d` - Weekly heatmap (TTL: 24 hours)

### Data Structure

**Time Series Snapshot:**
```typescript
{
  timestamp: 1704812400000,
  requests: {
    total: 1523,
    success: 1498,
    clientErrors: 12,
    serverErrors: 13
  },
  latency: {
    average: 42.5,
    min: 2.1,
    max: 523.8,
    p50: 38.2,
    p95: 125.3,
    p99: 287.6
  },
  uptime: 3600.5,
  perPlugin: [
    {
      pluginId: 'plugin-a',
      requests: 523,
      errors: 5,
      avgLatency: 38.2
    }
  ]
}
```

**Heatmap Cell:**
```typescript
{
  day: 'Mon',
  hour: 14,  // 2 PM
  value: 45.2  // Average latency in ms
}
```

## Performance

### Memory Usage

- **1 minute**: ~12 snapshots × ~2 KB = ~24 KB
- **5 minutes**: ~60 snapshots × ~2 KB = ~120 KB
- **1 hour**: ~720 snapshots × ~2 KB = ~1.4 MB
- **Heatmap**: 168 cells × 3 metrics × ~50 B = ~25 KB
- **Total**: ~1.6 MB per instance

### CPU Impact

- **Background collection**: ~5-10ms every 5 seconds
- **Query latency**: <5ms (in-memory cache)
- **Heatmap aggregation**: ~10-20ms per minute (low frequency)

## Integration with Dashboard

The Intelligence Dashboard widgets consume these endpoints:

1. **PredictiveAnalyticsWidget**
   - Endpoint: `/observability/metrics/history?metric=requests&range=30m`
   - Uses: Last 30 minutes for ML forecasting

2. **ActivityTimelineWidget**
   - Endpoint: `/observability/metrics/history?metric=requests&range=10m&interval=1m`
   - Uses: Configurable time range for real-time charts

3. **PerformanceHeatmapWidget**
   - Endpoint: `/observability/metrics/heatmap?metric=latency`
   - Uses: Weekly patterns visualization

## Monitoring

### Health Check

The collector provides statistics about its operation:

```bash
# Check collector status (internal API)
curl "http://localhost:5050/api/v1/observability/metrics/history?metric=requests&range=1m"
```

Successful response indicates collector is running and collecting data.

### Logs

The collector logs the following events:

```
[HistoricalMetrics] Starting historical metrics collector { intervalMs: 5000 }
[HistoricalMetrics] Metrics snapshot collected { timestamp: '2025-01-09T14:30:00.000Z', requests: 1523, latency: '42.50' }
[HistoricalMetrics] Historical metrics collector stopped
```

### Troubleshooting

**Problem: No historical data returned**
- Check if `platform.cache` is initialized (State Broker daemon running)
- Check if collector started successfully (see logs)
- Verify TTL hasn't expired (restart server to reset)

**Problem: Heatmap shows all zeros**
- Heatmap requires ~1 hour of data collection to show patterns
- Check if server has been running long enough
- Verify metrics are being collected (check `/metrics/json`)

**Problem: High memory usage**
- Reduce `maxPoints` configuration for time ranges
- Decrease `intervalMs` to collect less frequently
- Verify cache TTL is working (old data should be evicted)

## Future Enhancements

### Phase 3.2 (Planned)

- [ ] Add per-plugin historical endpoints
- [ ] Add adapter-specific metrics (LLM usage, embeddings, etc.)
- [ ] Enhanced latency percentiles (p50/p95/p99) per route

### Phase 3.3 (Planned)

- [ ] Incident history storage (detect and store incidents)
- [ ] Root cause analysis integration
- [ ] Automated incident correlation

### Long-term

- [ ] Persistent storage backend (PostgreSQL/TimescaleDB)
- [ ] Configurable retention policies
- [ ] Data export (CSV/JSON)
- [ ] Alerting based on historical trends
- [ ] Anomaly detection using historical baseline

## Related Documentation

- [Intelligence Dashboard Implementation Plan](../../kb-labs-studio/INTELLIGENCE_DASHBOARD_IMPLEMENTATION_PLAN.md)
- [REST API Observability](./api-observability.md)
- [Platform Cache Architecture](../../kb-labs-core/docs/PLATFORM_QUICK_REF.md)
- [State Broker Documentation](../../kb-labs-core/packages/state-broker/README.md)

## Testing

### Manual Testing

```bash
# 1. Start REST API server
cd kb-labs-rest-api
pnpm start

# 2. Wait 1-2 minutes for data collection

# 3. Test history endpoint
curl "http://localhost:5050/api/v1/observability/metrics/history?metric=requests&range=1m" | jq

# 4. Test heatmap endpoint
curl "http://localhost:5050/api/v1/observability/metrics/heatmap?metric=latency" | jq

# 5. Verify data points
curl "http://localhost:5050/api/v1/observability/metrics/history?metric=latency&range=5m" | jq '.data | length'
# Should return > 0
```

### Integration Testing

See `apps/rest-api/src/routes/__tests__/observability.spec.ts` for automated tests (TODO: create test file).

## License

MIT - See LICENSE file in repository root.

---

**Last Updated:** 2025-01-09
**Version:** 1.0.0
**Status:** ✅ Implemented (Phase 3.1 Complete)
