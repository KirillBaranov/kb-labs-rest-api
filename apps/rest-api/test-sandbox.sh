#!/bin/bash

# Test script for KB Labs REST API with sandbox execution
# Usage: ./test-sandbox.sh

set -e

echo "🧪 Testing KB Labs REST API Sandbox Execution"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
BASE_PATH="/api/v1"

echo "📡 API URL: ${API_URL}"
echo ""

# Test 1: Check if server is running
echo "1️⃣  Testing server health..."
if curl -s -f "${API_URL}${BASE_PATH}/health" > /dev/null; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running. Start it with: npm run dev${NC}"
    exit 1
fi

# Test 2: Check plugin registry
echo ""
echo "2️⃣  Testing plugin registry..."
REGISTRY_RESPONSE=$(curl -s "${API_URL}${BASE_PATH}/plugins/registry")
if echo "$REGISTRY_RESPONSE" | grep -q "mind"; then
    echo -e "${GREEN}✅ Mind plugin found in registry${NC}"
    echo "   Found plugins: $(echo "$REGISTRY_RESPONSE" | jq -r '.manifests[].id' 2>/dev/null || echo 'unknown')"
else
    echo -e "${YELLOW}⚠️  Mind plugin not found in registry${NC}"
    echo "   Response: $REGISTRY_RESPONSE"
fi

# Test 3: Test Mind query endpoint (sandbox execution)
echo ""
echo "3️⃣  Testing Mind query endpoint (sandbox execution)..."
QUERY_RESPONSE=$(curl -s -X POST "${API_URL}${BASE_PATH}/plugins/mind/query" \
    -H "Content-Type: application/json" \
    -d '{
        "query": "meta",
        "params": {},
        "options": {
            "cwd": ".",
            "json": true
        }
    }')

if echo "$QUERY_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✅ Query endpoint responded successfully${NC}"
    echo "   Response structure:"
    echo "$QUERY_RESPONSE" | jq '.' 2>/dev/null || echo "$QUERY_RESPONSE"
else
    echo -e "${RED}❌ Query endpoint failed${NC}"
    echo "   Response: $QUERY_RESPONSE"
fi

# Test 4: Check for sandbox execution metrics
echo ""
echo "4️⃣  Checking for execution metrics..."
if echo "$QUERY_RESPONSE" | grep -q "meta"; then
    echo -e "${GREEN}✅ Execution metrics found${NC}"
    METRICS=$(echo "$QUERY_RESPONSE" | jq -r '.meta.exec' 2>/dev/null || echo '{}')
    echo "   Metrics: $METRICS"
else
    echo -e "${YELLOW}⚠️  No metrics found in response${NC}"
fi

# Test 5: Test error handling (invalid request)
echo ""
echo "5️⃣  Testing error handling..."
ERROR_RESPONSE=$(curl -s -X POST "${API_URL}${BASE_PATH}/plugins/mind/query" \
    -H "Content-Type: application/json" \
    -d '{
        "invalid": "request"
    }')

if echo "$ERROR_RESPONSE" | grep -q "error\|status.*error"; then
    echo -e "${GREEN}✅ Error handling works${NC}"
    echo "   Error response:"
    echo "$ERROR_RESPONSE" | jq '.' 2>/dev/null || echo "$ERROR_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Unexpected error response format${NC}"
    echo "   Response: $ERROR_RESPONSE"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}✅ Sandbox execution test complete!${NC}"
echo ""
echo "💡 Tips:"
echo "   - Set KB_PLUGIN_DEV_MODE=true for in-process execution"
echo "   - Check logs for detailed execution info"
echo "   - Use --json flag in plugin responses for AI agents"

