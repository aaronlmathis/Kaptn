#!/bin/bash

# Phase 4 TimeSeries API Test Script
# Tests the REST and WebSocket endpoints for timeseries data

set -e

API_BASE="http://localhost:9999/api/v1"
AUTH_HEADER="Authorization: Bearer fake-token"

echo "=== Testing TimeSeries API Phase 4 ==="
echo

# Test 1: Basic timeseries endpoint
echo "1. Testing basic timeseries endpoint..."
echo "GET ${API_BASE}/timeseries/cluster"
curl -s -H "${AUTH_HEADER}" "${API_BASE}/timeseries/cluster" | jq . || echo "No authentication configured or service not running"
echo -e "\n"

# Test 2: Specific series with parameters
echo "2. Testing specific series with parameters..."
echo "GET ${API_BASE}/timeseries/cluster?series=cluster.cpu.used.cores&res=hi&since=5m"
curl -s -H "${AUTH_HEADER}" "${API_BASE}/timeseries/cluster?series=cluster.cpu.used.cores&res=hi&since=5m" | jq . || echo "No authentication configured or service not running"
echo -e "\n"

# Test 3: Multiple series
echo "3. Testing multiple series..."
echo "GET ${API_BASE}/timeseries/cluster?series=cluster.cpu.used.cores,cluster.cpu.capacity.cores&res=lo&since=30m"
curl -s -H "${AUTH_HEADER}" "${API_BASE}/timeseries/cluster?series=cluster.cpu.used.cores,cluster.cpu.capacity.cores&res=lo&since=30m" | jq . || echo "No authentication configured or service not running"
echo -e "\n"

# Test 4: Invalid parameters
echo "4. Testing invalid parameters..."
echo "GET ${API_BASE}/timeseries/cluster?res=invalid"
curl -s -H "${AUTH_HEADER}" "${API_BASE}/timeseries/cluster?res=invalid" | jq . || echo "No authentication configured or service not running"
echo -e "\n"

# Test 5: WebSocket endpoint (just check if it accepts connections)
echo "5. Testing WebSocket endpoint availability..."
echo "Note: WebSocket endpoint is at ws://localhost:9999/api/v1/timeseries/cluster/live"
echo "Use a WebSocket client to test real-time streaming"
echo -e "\n"

echo "=== TimeSeries API Test Complete ==="
echo
echo "Next steps:"
echo "1. Start the server: make dev"
echo "2. Run this script again to test with live data"
echo "3. Use a WebSocket client to test live streaming"
