#!/bin/bash

# Comprehensive TimeSeries API Key Validation Script
# This script tests all metric keys defined in internal/timeseries/keys.go
# to ensure they are implemented and returning data

set -e

# Configuration
API_BASE="http://localhost:9999/api/v1/timeseries"
AUTH_HEADER="Authorization: Bearer fake-token"
TEMP_DIR="/tmp/kaptn_test_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_FILE="${TEMP_DIR}/test_results_${TIMESTAMP}.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create temp directory
mkdir -p "${TEMP_DIR}"

# Initialize results
echo "{" > "${RESULTS_FILE}"
echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"," >> "${RESULTS_FILE}"
echo "  \"api_base\": \"${API_BASE}\"," >> "${RESULTS_FILE}"
echo "  \"test_results\": {" >> "${RESULTS_FILE}"

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
MISSING_KEYS=0

echo -e "${BLUE}=== Kaptn TimeSeries API Key Validation ===${NC}"
echo -e "${BLUE}Testing all keys defined in internal/timeseries/keys.go${NC}"
echo -e "${BLUE}Results will be saved to: ${RESULTS_FILE}${NC}"
echo

# Function to test an API endpoint and check for specific keys
test_endpoint() {
    local endpoint="$1"
    local keys_array=("${@:2}")
    local endpoint_name=$(basename "$endpoint")
    
    echo -e "${YELLOW}Testing endpoint: ${endpoint}${NC}"
    
    # Make API call
    local response=$(curl -s -H "${AUTH_HEADER}" "${endpoint}" 2>/dev/null || echo "ERROR")
    
    if [[ "$response" == "ERROR" ]]; then
        echo -e "${RED}  ❌ Failed to connect to endpoint${NC}"
        echo "    \"${endpoint_name}\": {" >> "${RESULTS_FILE}"
        echo "      \"status\": \"connection_failed\"," >> "${RESULTS_FILE}"
        echo "      \"tested_keys\": []," >> "${RESULTS_FILE}"
        echo "      \"found_keys\": []," >> "${RESULTS_FILE}"
        echo "      \"missing_keys\": []" >> "${RESULTS_FILE}"
        echo "    }," >> "${RESULTS_FILE}"
        return 1
    fi
    
    # Check if response is valid JSON
    if ! echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${RED}  ❌ Invalid JSON response${NC}"
        echo "    \"${endpoint_name}\": {" >> "${RESULTS_FILE}"
        echo "      \"status\": \"invalid_json\"," >> "${RESULTS_FILE}"
        echo "      \"response_preview\": \"$(echo "$response" | head -c 200 | sed 's/"/\\"/g')\"," >> "${RESULTS_FILE}"
        echo "      \"tested_keys\": []," >> "${RESULTS_FILE}"
        echo "      \"found_keys\": []," >> "${RESULTS_FILE}"
        echo "      \"missing_keys\": []" >> "${RESULTS_FILE}"
        echo "    }," >> "${RESULTS_FILE}"
        return 1
    fi
    
    # Extract available series keys from response
    local available_keys=$(echo "$response" | jq -r '.series | keys[]' 2>/dev/null | sort -u)
    
    echo "    \"${endpoint_name}\": {" >> "${RESULTS_FILE}"
    echo "      \"status\": \"success\"," >> "${RESULTS_FILE}"
    echo "      \"tested_keys\": [" >> "${RESULTS_FILE}"
    
    local found_keys=()
    local missing_keys=()
    local first_key=true
    
    # Test each key
    for key in "${keys_array[@]}"; do
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
        
        if [[ "$first_key" == true ]]; then
            first_key=false
        else
            echo "," >> "${RESULTS_FILE}"
        fi
        echo -n "        \"$key\"" >> "${RESULTS_FILE}"
        
        # Check if key exists in available keys
        if echo "$available_keys" | grep -q "^${key}$"; then
            echo -e "    ${GREEN}✓${NC} $key"
            found_keys+=("$key")
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "    ${RED}✗${NC} $key (missing)"
            missing_keys+=("$key")
            FAILED_TESTS=$((FAILED_TESTS + 1))
            MISSING_KEYS=$((MISSING_KEYS + 1))
        fi
    done
    
    echo "" >> "${RESULTS_FILE}"
    echo "      ]," >> "${RESULTS_FILE}"
    echo "      \"found_keys\": [" >> "${RESULTS_FILE}"
    
    first_key=true
    for key in "${found_keys[@]}"; do
        if [[ "$first_key" == true ]]; then
            first_key=false
        else
            echo "," >> "${RESULTS_FILE}"
        fi
        echo -n "        \"$key\"" >> "${RESULTS_FILE}"
    done
    
    echo "" >> "${RESULTS_FILE}"
    echo "      ]," >> "${RESULTS_FILE}"
    echo "      \"missing_keys\": [" >> "${RESULTS_FILE}"
    
    first_key=true
    for key in "${missing_keys[@]}"; do
        if [[ "$first_key" == true ]]; then
            first_key=false
        else
            echo "," >> "${RESULTS_FILE}"
        fi
        echo -n "        \"$key\"" >> "${RESULTS_FILE}"
    done
    
    echo "" >> "${RESULTS_FILE}"
    echo "      ]," >> "${RESULTS_FILE}"
    echo "      \"total_keys\": ${#keys_array[@]}," >> "${RESULTS_FILE}"
    echo "      \"found_count\": ${#found_keys[@]}," >> "${RESULTS_FILE}"
    echo "      \"missing_count\": ${#missing_keys[@]}" >> "${RESULTS_FILE}"
    echo "    }," >> "${RESULTS_FILE}"
    
    echo
}

# Test health endpoint first
echo -e "${BLUE}=== Testing API Health ===${NC}"
health_response=$(curl -s -H "${AUTH_HEADER}" "${API_BASE}/health" 2>/dev/null || echo "ERROR")
if [[ "$health_response" == "ERROR" ]]; then
    echo -e "${RED}❌ Cannot connect to API. Make sure the server is running with 'make dev'${NC}"
    exit 1
else
    echo -e "${GREEN}✓ API is accessible${NC}"
    if echo "$health_response" | jq . >/dev/null 2>&1; then
        echo "Health status: $(echo "$health_response" | jq -r '.status // "unknown"')"
    fi
fi
echo

# Get capabilities to understand what the API supports
echo -e "${BLUE}=== Testing API Capabilities ===${NC}"
capabilities_response=$(curl -s -H "${AUTH_HEADER}" "${API_BASE}/capabilities" 2>/dev/null || echo "ERROR")
if [[ "$capabilities_response" != "ERROR" ]] && echo "$capabilities_response" | jq . >/dev/null 2>&1; then
    echo "Available endpoints:"
    echo "$capabilities_response" | jq -r '.endpoints[]? // empty' | sed 's/^/  - /'
    echo "Available series count: $(echo "$capabilities_response" | jq -r '.series_count // "unknown"')"
else
    echo -e "${YELLOW}⚠ Could not retrieve capabilities${NC}"
fi
echo

# Define all metric keys from keys.go
echo -e "${BLUE}=== Testing Cluster-Level Metrics ===${NC}"
cluster_keys=(
    "cluster.cpu.used.cores"
    "cluster.cpu.capacity.cores"
    "cluster.mem.used.bytes"
    "cluster.mem.capacity.bytes"
    "cluster.net.rx.bps"
    "cluster.net.tx.bps"
    "cluster.nodes.count"
    "cluster.pods.running"
    "cluster.pods.pending"
    "cluster.pods.failed"
    "cluster.pods.succeeded"
    "cluster.cpu.allocatable.cores"
    "cluster.mem.allocatable.bytes"
    "cluster.cpu.requested.cores"
    "cluster.mem.requested.bytes"
    "cluster.cpu.limits.cores"
    "cluster.mem.limits.bytes"
    "cluster.pods.restarts.total"
    "cluster.pods.restarts.rate"
    "cluster.nodes.ready"
    "cluster.nodes.notready"
    "cluster.pods.unschedulable"
    "cluster.fs.image.used.bytes"
    "cluster.fs.image.capacity.bytes"
)

test_endpoint "${API_BASE}/cluster?since=5m" "${cluster_keys[@]}"

# Test node-level metrics (need to get a node name first)
echo -e "${BLUE}=== Testing Node-Level Metrics ===${NC}"
node_response=$(curl -s -H "${AUTH_HEADER}" "${API_BASE}/nodes?since=5m" 2>/dev/null || echo "ERROR")
if [[ "$node_response" != "ERROR" ]] && echo "$node_response" | jq . >/dev/null 2>&1; then
    # Extract a node name from the response - get the first node from any series key
    first_node=$(echo "$node_response" | jq -r '.series | keys[]' 2>/dev/null | head -1 | rev | cut -d'.' -f1 | rev)
    if [[ -n "$first_node" && "$first_node" != "null" ]]; then
        echo "Testing with node: $first_node"
        
        node_base_keys=(
            "node.cpu.usage.cores"
            "node.mem.usage.bytes"
            "node.mem.working_set.bytes"
            "node.net.rx.bps"
            "node.net.tx.bps"
            "node.fs.used.bytes"
            "node.fs.used.percent"
            "node.imagefs.used.bytes"
            "node.process.count"
            "node.capacity.cpu.cores"
            "node.capacity.mem.bytes"
            "node.allocatable.cpu.cores"
            "node.allocatable.mem.bytes"
            "node.pods.count"
            "node.imagefs.capacity.bytes"
            "node.imagefs.used.percent"
            "node.fs.inodes.used.percent"
            "node.net.rx.pps"
            "node.net.tx.pps"
        )
        
        # Generate full node keys
        node_keys=()
        for base in "${node_base_keys[@]}"; do
            node_keys+=("${base}.${first_node}")
        done
        
        test_endpoint "${API_BASE}/nodes/${first_node}?since=5m" "${node_keys[@]}"
    else
        echo -e "${YELLOW}⚠ No nodes found to test node-level metrics${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not retrieve nodes endpoint${NC}"
fi

# Test pod-level metrics
echo -e "${BLUE}=== Testing Pod-Level Metrics ===${NC}"
pod_response=$(curl -s -H "${AUTH_HEADER}" "${API_BASE}/pods?since=5m" 2>/dev/null || echo "ERROR")
if [[ "$pod_response" != "ERROR" ]] && echo "$pod_response" | jq . >/dev/null 2>&1; then
    # Extract a pod that has usage metrics (not just limits/requests)
    first_pod_series=$(echo "$pod_response" | jq -r '.series | keys[]' 2>/dev/null | grep "pod.cpu.usage.cores" | head -1)
    if [[ -n "$first_pod_series" && "$first_pod_series" != "null" ]]; then
        # Parse pod.{metric}.{namespace}.{podname} - but metric might have multiple parts
        # Let's extract the last two parts (namespace.podname)
        pod_suffix=$(echo "$first_pod_series" | rev | cut -d'.' -f1,2 | rev)
        pod_namespace=$(echo "$pod_suffix" | cut -d'.' -f1)
        pod_name=$(echo "$pod_suffix" | cut -d'.' -f2)
        
        if [[ -n "$pod_namespace" && -n "$pod_name" ]]; then
            echo "Testing with pod: $pod_namespace/$pod_name"
            
            pod_base_keys=(
                "pod.cpu.usage.cores"
                "pod.mem.usage.bytes"
                "pod.mem.working_set.bytes"
                "pod.net.rx.bps"
                "pod.net.tx.bps"
                "pod.ephemeral.used.bytes"
                "pod.cpu.request.cores"
                "pod.cpu.limit.cores"
                "pod.mem.request.bytes"
                "pod.mem.limit.bytes"
                "pod.restarts.total"
                "pod.restarts.rate"
                "pod.ephemeral.used.percent"
            )
            
            # Generate full pod keys
            pod_keys=()
            for base in "${pod_base_keys[@]}"; do
                pod_keys+=("${base}.${pod_namespace}.${pod_name}")
            done
            
            test_endpoint "${API_BASE}/pods/${pod_namespace}/${pod_name}?since=5m" "${pod_keys[@]}"
        fi
    else
        echo -e "${YELLOW}⚠ No pods found to test pod-level metrics${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not retrieve pods endpoint${NC}"
fi

# Test namespace-level metrics
echo -e "${BLUE}=== Testing Namespace-Level Metrics ===${NC}"
ns_response=$(curl -s -H "${AUTH_HEADER}" "${API_BASE}/namespaces?since=5m" 2>/dev/null || echo "ERROR")
if [[ "$ns_response" != "ERROR" ]] && echo "$ns_response" | jq . >/dev/null 2>&1; then
    # Extract a namespace from the response - namespace is the last part
    first_namespace=$(echo "$ns_response" | jq -r '.series | keys[]' 2>/dev/null | grep -E '^ns\.' | head -1 | rev | cut -d'.' -f1 | rev)
    if [[ -n "$first_namespace" && "$first_namespace" != "null" ]]; then
        echo "Testing with namespace: $first_namespace"
        
        ns_base_keys=(
			'ns.cpu.request.cores.default'
			'ns.cpu.limit.cores.default'
			'ns.cpu.used.cores.default'
			'ns.mem.request.bytes.default'
			'ns.mem.limit.bytes.default'
			'ns.mem.used.bytes.default'
			
			'ns.cpu.request.cores.production'
			'ns.cpu.limit.cores.production'
			'ns.cpu.used.cores.production'
			'ns.mem.request.bytes.production'
			'ns.mem.limit.bytes.production'
			'ns.mem.used.bytes.production'
			
			'ns.cpu.request.cores.cache'
			'ns.cpu.limit.cores.cache'
			'ns.cpu.used.cores.cache'
			'ns.mem.request.bytes.cache'
			'ns.mem.limit.bytes.cache'
			'ns.mem.used.bytes.cache'
        )
        
        # Generate full namespace keys
        ns_keys=()
        for base in "${ns_base_keys[@]}"; do
            ns_keys+=("${base}.${first_namespace}")
        done
        
        test_endpoint "${API_BASE}/namespaces/${first_namespace}?since=5m" "${ns_keys[@]}"
    else
        echo -e "${YELLOW}⚠ No namespaces found to test namespace-level metrics${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not retrieve namespaces endpoint${NC}"
fi

# Finalize results file
echo "    \"summary\": {" >> "${RESULTS_FILE}"
echo "      \"total_tests\": ${TOTAL_TESTS}," >> "${RESULTS_FILE}"
echo "      \"passed_tests\": ${PASSED_TESTS}," >> "${RESULTS_FILE}"
echo "      \"failed_tests\": ${FAILED_TESTS}," >> "${RESULTS_FILE}"
echo "      \"missing_keys\": ${MISSING_KEYS}" >> "${RESULTS_FILE}"
echo "    }" >> "${RESULTS_FILE}"
echo "  }" >> "${RESULTS_FILE}"
echo "}" >> "${RESULTS_FILE}"

# Remove trailing comma from JSON (simple fix)
sed -i 's/,\([[:space:]]*\)}/\1}/g' "${RESULTS_FILE}"

# Print summary
echo -e "${BLUE}=== Test Summary ===${NC}"
echo -e "Total tests: ${TOTAL_TESTS}"
echo -e "Passed: ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed: ${RED}${FAILED_TESTS}${NC}"
echo -e "Missing keys: ${RED}${MISSING_KEYS}${NC}"

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}🎉 All tests passed! All keys are implemented and returning data.${NC}"
    exit_code=0
else
    echo -e "${RED}❌ Some tests failed. Check the detailed results in ${RESULTS_FILE}${NC}"
    exit_code=1
fi

echo
echo -e "${BLUE}Detailed results saved to: ${RESULTS_FILE}${NC}"
echo -e "${BLUE}View results with: jq . ${RESULTS_FILE}${NC}"

exit $exit_code
