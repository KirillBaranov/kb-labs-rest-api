# 🧪 Testing Sandbox Execution

## Quick Start

### 1. Build Required Packages

```bash
# From monorepo root
cd kb-labs-core/packages/plugin-runtime
pnpm build

cd ../plugin-manifest
pnpm build

cd ../plugin-adapter-rest
pnpm build

cd ../../../kb-labs-mind/packages/mind-cli
pnpm build
```

### 2. Start REST API Server

```bash
cd kb-labs-rest-api/apps/rest-api
pnpm dev
```

Server will start on `http://localhost:3000` (or port from config)

### 3. Run Test Script

```bash
# In another terminal
cd kb-labs-rest-api/apps/rest-api
./test-sandbox.sh
```

Or manually test with curl:

```bash
# Test plugin registry
curl http://localhost:3000/api/v1/plugins/registry | jq

# Test Mind query endpoint (sandbox execution)
curl -X POST http://localhost:3000/api/v1/plugins/mind/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "meta",
    "params": {},
    "options": {
      "cwd": ".",
      "json": true
    }
  }' | jq
```

## What to Check

### ✅ Success Indicators

1. **Server starts** - No errors in logs
2. **Plugin discovery** - Mind plugin appears in registry
3. **Route mounting** - `/api/v1/plugins/mind/query` exists
4. **Sandbox execution** - Handler runs in isolated process
5. **Response format** - JSON with `status`, `data`, `meta.exec`
6. **Error handling** - Invalid requests return ErrorEnvelope

### 🔍 Debug Mode

Set environment variable for in-process execution:

```bash
KB_PLUGIN_DEV_MODE=true pnpm dev
```

This will:
- Run handlers in-process (no fork)
- Include logs in response (`logs` field)
- Faster iteration for development

### 📊 Expected Response Structure

**Success:**
```json
{
  "status": "ok",
  "data": { /* handler result */ },
  "meta": {
    "requestId": "req_...",
    "durationMs": 123,
    "apiVersion": "1.0",
    "exec": {
      "timeMs": 123,
      "cpuMs": 45,
      "memMb": 12
    }
  }
}
```

**Error:**
```json
{
  "status": "error",
  "http": 500,
  "code": "E_PLUGIN_HANDLER_NOT_FOUND",
  "message": "...",
  "details": { /* error details */ },
  "meta": {
    "requestId": "req_...",
    "pluginId": "@kb-labs/mind",
    "timeMs": 50
  }
}
```

## Troubleshooting

### Plugin Not Found

1. Check `kb-labs-mind/packages/mind-cli/package.json`:
   ```json
   {
     "kb": {
       "manifest": "./dist/manifest.v2.js"
     }
   }
   ```

2. Ensure manifest is built:
   ```bash
   cd kb-labs-mind/packages/mind-cli
   pnpm build
   ```

3. Check discovery logs in server startup

### Handler Not Found

1. Check handler path in manifest:
   ```typescript
   handler: './gateway/handlers/query-handler.js#handleQuery'
   ```

2. Ensure handler file exists and is built:
   ```bash
   ls kb-labs-mind/packages/mind-cli/dist/gateway/handlers/query-handler.js
   ```

3. Check export name matches (`handleQuery`)

### Sandbox Execution Fails

1. Check `bootstrap.js` exists:
   ```bash
   ls kb-labs-core/packages/plugin-runtime/dist/sandbox/child/bootstrap.js
   ```

2. Check permissions on handler file (must be readable)

3. Check logs for child process errors

4. Try dev mode first:
   ```bash
   KB_PLUGIN_DEV_MODE=true pnpm dev
   ```

## Next Steps

Once basic execution works:

1. ✅ Test with different permissions
2. ✅ Test with different quotas (timeout, memory)
3. ✅ Test error scenarios
4. ✅ Test with multiple plugins
5. ✅ Test workflow orchestration (when ready)
6. ✅ Test webhooks (when ready)

