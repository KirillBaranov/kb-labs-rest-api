# Incident System Testing Guide

This guide shows how to test the incident detection and management system using the test endpoints.

## Test Endpoints

### 1. Create Incident Manually

**Endpoint:** `POST /api/v1/test/create-incident`

**Description:** Creates a test incident directly in the database without waiting for auto-detection.

**Request Body:**
```json
{
  "type": "custom",           // optional: error_rate | latency_spike | plugin_failure | adapter_failure | system_health | custom
  "severity": "warning",      // optional: critical | warning | info
  "title": "Test Incident"    // optional: custom title
}
```

**Example:**
```bash
curl -X POST http://localhost:5050/api/v1/test/create-incident \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom",
    "severity": "critical",
    "title": "Manual Test Incident"
  }'
```

**Use case:** Quick testing of incident list/detail pages and AI analysis.

---

### 2. Trigger Errors (Auto-detect)

**Endpoint:** `GET /api/v1/test/trigger-errors?count=10`

**Description:** Generates error logs that will trigger auto-detection of an `error_rate` incident.

**Query Parameters:**
- `count` (optional): Number of errors to generate (1-100, default: 10)

**Example:**
```bash
# Generate 20 test errors
curl http://localhost:5050/api/v1/test/trigger-errors?count=20

# Wait ~30 seconds for incident detector to run
# Then check incidents
curl http://localhost:5050/api/v1/observability/incidents
```

**Use case:** Testing auto-detection of high error rates. Good for testing the full incident lifecycle.

---

### 3. Simulate Latency

**Endpoint:** `GET /api/v1/test/simulate-latency?delay=2000`

**Description:** Simulates slow API responses to trigger `latency_spike` incident detection.

**Query Parameters:**
- `delay` (optional): Delay in milliseconds (100-10000, default: 2000)

**Example:**
```bash
# Simulate 3-second latency (call multiple times)
for i in {1..10}; do
  curl http://localhost:5050/api/v1/test/simulate-latency?delay=3000
done

# Wait ~30 seconds for incident detector
# Check for latency_spike incident
curl http://localhost:5050/api/v1/observability/incidents
```

**Use case:** Testing latency-based incident detection.

---

### 4. Bulk Error Generator

**Endpoint:** `POST /api/v1/test/bulk-errors`

**Description:** Generates a bulk of success/error requests to guarantee incident creation.

**Request Body:**
```json
{
  "successCount": 10,  // optional, default: 10
  "errorCount": 50     // optional, default: 50
}
```

**Example:**
```bash
curl -X POST http://localhost:5050/api/v1/test/bulk-errors \
  -H "Content-Type: application/json" \
  -d '{
    "successCount": 10,
    "errorCount": 100
  }'

# This creates 91% error rate (100/110), which will definitely trigger critical incident
```

**Use case:** Guaranteed incident creation for demos or testing analytics.

---

## Testing Workflow

### 1. Test Manual Incident Creation

```bash
# Create a test incident
curl -X POST http://localhost:5050/api/v1/test/create-incident \
  -H "Content-Type: application/json" \
  -d '{"severity": "critical", "title": "Demo Incident"}'

# Get the incident ID from response
INCIDENT_ID="<id-from-response>"

# View in Studio
open http://localhost:5173/observability/incidents/$INCIDENT_ID

# Analyze with AI
curl -X POST http://localhost:5050/api/v1/observability/incidents/$INCIDENT_ID/analyze

# Resolve it
curl -X POST http://localhost:5050/api/v1/observability/incidents/$INCIDENT_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolutionNotes": "Fixed in testing"}'
```

### 2. Test Auto-Detection

```bash
# Generate errors to trigger auto-detection
curl -X POST http://localhost:5050/api/v1/test/bulk-errors \
  -H "Content-Type: application/json" \
  -d '{"errorCount": 80}'

# Wait 30 seconds for detector to run
echo "Waiting 30 seconds for incident detector..."
sleep 30

# Check if incident was created
curl http://localhost:5050/api/v1/observability/incidents | jq

# Or open in Studio
open http://localhost:5173/observability/incidents
```

### 3. Test Full Lifecycle

```bash
# Step 1: Create incident
RESPONSE=$(curl -s -X POST http://localhost:5050/api/v1/test/create-incident \
  -H "Content-Type: application/json" \
  -d '{"severity": "critical", "title": "Full Test"}')

INCIDENT_ID=$(echo $RESPONSE | jq -r '.data.id')
echo "Created incident: $INCIDENT_ID"

# Step 2: View details
curl http://localhost:5050/api/v1/observability/incidents/$INCIDENT_ID | jq

# Step 3: Analyze with AI
curl -X POST http://localhost:5050/api/v1/observability/incidents/$INCIDENT_ID/analyze | jq

# Step 4: Resolve
curl -X POST http://localhost:5050/api/v1/observability/incidents/$INCIDENT_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolutionNotes": "Issue resolved"}' | jq

# Step 5: Verify resolved
curl http://localhost:5050/api/v1/observability/incidents/$INCIDENT_ID | jq '.data.resolvedAt'
```

---

## Incident Detector Configuration

The incident detector runs every **30 seconds** by default and checks for:

### Error Rate Thresholds
- **Warning:** ≥5% error rate
- **Critical:** ≥10% error rate
- **Minimum requests:** 10 requests needed for detection

### Latency Thresholds
- **Warning:** P99 ≥500ms
- **Critical:** P99 ≥1000ms

### Cooldown Period
- **5 minutes** between incidents of the same type to prevent spam

---

## Tips

1. **View metrics in real-time:**
   ```bash
   curl http://localhost:5050/metrics/json | jq
   ```

2. **Check incident detector logs:**
   - Look for `[IncidentDetector]` prefix in REST API logs
   - Shows detection cycles and created incidents

3. **Test in Studio:**
   - Start Studio: `cd kb-labs-studio/apps/studio && pnpm run dev`
   - Navigate to http://localhost:5173/observability/incidents
   - See real-time updates (auto-refresh every 30s)

4. **Generate realistic incidents:**
   - Use bulk-errors with different ratios
   - Combine with latency simulation
   - Test multiple incident types simultaneously

---

## Troubleshooting

**Incident not created after 30 seconds?**
- Check if error rate is above threshold (5% warning, 10% critical)
- Verify minimum request count (10 requests)
- Check cooldown - wait 5 minutes before retrying same incident type
- Look at REST API logs for `[IncidentDetector]` messages

**AI analysis not working?**
- Ensure LLM adapter is configured in `kb.config.json`
- Check OpenAI API key in environment
- Falls back to basic analysis if LLM unavailable

**No related logs/metrics in incident?**
- Logs must be stored via platform.logs (not console.log)
- Metrics are collected automatically by REST API
- Timeline shows last 5 minutes of events
