#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔍 Comprehensive WebSocket Debug Test');
console.log('=====================================');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

let receivedMessages = [];
let helloMessage = null;

ws.on('open', () => {
	console.log('✅ WebSocket connected');
});

ws.on('message', (data) => {
	try {
		const message = JSON.parse(data.toString());
		receivedMessages.push(message);

		console.log(`📥 Message ${receivedMessages.length}: ${message.type}`);

		if (message.type === 'hello') {
			helloMessage = message;
			console.log('📋 Hello Message Details:');
			console.log('  Capabilities:', JSON.stringify(message.capabilities, null, 2));
			console.log('  Limits:', JSON.stringify(message.limits, null, 2));

			// Wait a moment, then test node entity discovery
			setTimeout(testNodeDiscovery, 1000);
		} else if (message.type === 'ack') {
			console.log('📋 ACK Message Details:');
			console.log('  Accepted:', message.accepted?.length || 0);
			console.log('  Rejected:', message.rejected?.length || 0);
			if (message.rejected?.length > 0) {
				console.log('  Rejected details:', JSON.stringify(message.rejected, null, 2));
			}
		} else if (message.type === 'init') {
			console.log('📋 INIT Message Details:');
			console.log('  Series count:', Object.keys(message.data?.series || {}).length);
			console.log('  Series keys:', Object.keys(message.data?.series || {}));
		} else if (message.type === 'append') {
			console.log(`📋 APPEND: ${message.key} = ${message.point?.v}`);
		} else if (message.type === 'error') {
			console.log('❌ ERROR:', message.error);
		}

	} catch (error) {
		console.log('📥 Raw message:', data.toString());
	}
});

async function testNodeDiscovery() {
	console.log('\n🔍 Testing Node Discovery...');

	try {
		const response = await fetch('http://localhost:9999/api/v1/timeseries/entities/nodes');
		const nodeData = await response.json();

		if (nodeData.entities && nodeData.entities.length > 0) {
			console.log(`✅ Found ${nodeData.entities.length} nodes:`);
			nodeData.entities.forEach(node => {
				console.log(`  - ${node.name} (id: ${node.id})`);
			});

			// Test subscription with actual node names
			setTimeout(() => testNodeSubscription(nodeData.entities), 1000);
		} else {
			console.log('❌ No nodes found');
			setTimeout(testClusterSubscription, 1000);
		}
	} catch (error) {
		console.log('❌ Node discovery failed:', error.message);
		setTimeout(testClusterSubscription, 1000);
	}
}

function testNodeSubscription(nodes) {
	console.log('\n🔍 Testing Node Subscription...');

	// Take first node for testing
	const testNode = nodes[0];
	console.log(`📤 Subscribing to metrics for node: ${testNode.name}`);

	const subscription = {
		type: 'subscribe',
		groupId: 'debug-node-test',
		res: 'lo',
		since: '15m',
		series: [
			`node.cpu.usage.cores.${testNode.name}`,
			`node.mem.usage.bytes.${testNode.name}`,
			`node.capacity.cpu.cores.${testNode.name}`,
			`node.capacity.mem.bytes.${testNode.name}`
		]
	};

	console.log('📤 Subscription payload:', JSON.stringify(subscription, null, 2));
	ws.send(JSON.stringify(subscription));

	// After 5 seconds, test cluster subscription
	setTimeout(testClusterSubscription, 5000);
}

function testClusterSubscription() {
	console.log('\n🔍 Testing Cluster Subscription...');

	const subscription = {
		type: 'subscribe',
		groupId: 'debug-cluster-test',
		res: 'lo',
		since: '15m',
		series: [
			'cluster.cpu.used.cores',
			'cluster.cpu.capacity.cores',
			'cluster.mem.used.bytes',
			'cluster.mem.capacity.bytes'
		]
	};

	console.log('📤 Cluster subscription:', JSON.stringify(subscription, null, 2));
	ws.send(JSON.stringify(subscription));

	// After 5 seconds, check store keys
	setTimeout(checkStoreKeys, 5000);
}

async function checkStoreKeys() {
	console.log('\n🔍 Checking TimeSeries Store Keys...');

	try {
		const response = await fetch('http://localhost:9999/api/v1/timeseries/health');
		const healthData = await response.json();

		console.log('📋 Health Status:', healthData.status);
		console.log('📋 Series Count:', healthData.health?.series_count || 'unknown');
		console.log('📋 WS Clients:', healthData.health?.ws_clients || 'unknown');

	} catch (error) {
		console.log('❌ Health check failed:', error.message);
	}

	// Try to get cluster metrics via REST API
	setTimeout(testRestAPI, 2000);
}

async function testRestAPI() {
	console.log('\n🔍 Testing REST API for comparison...');

	try {
		// Test cluster metrics
		const clusterResponse = await fetch('http://localhost:9999/api/v1/timeseries/cluster?series=cluster.cpu.used.cores,cluster.mem.used.bytes&since=5m');
		const clusterData = await clusterResponse.json();

		console.log('📋 Cluster REST API:');
		console.log('  Series count:', Object.keys(clusterData.series || {}).length);
		console.log('  Series keys:', Object.keys(clusterData.series || {}));

		// Test node metrics
		const nodeResponse = await fetch('http://localhost:9999/api/v1/timeseries/nodes?series=node.cpu.usage.cores,node.mem.usage.bytes&since=5m');
		const nodeData = await nodeResponse.json();

		console.log('📋 Node REST API:');
		console.log('  Series count:', Object.keys(nodeData.series || {}).length);
		console.log('  Series keys:', Object.keys(nodeData.series || {}));

	} catch (error) {
		console.log('❌ REST API test failed:', error.message);
	}

	setTimeout(printSummary, 2000);
}

function printSummary() {
	console.log('\n📊 TEST SUMMARY');
	console.log('================');
	console.log(`Total messages received: ${receivedMessages.length}`);
	console.log('Message types received:', receivedMessages.map(m => m.type).join(', '));

	if (helloMessage) {
		console.log('\n🎯 Server Capabilities:');
		Object.entries(helloMessage.capabilities).forEach(([key, value]) => {
			console.log(`  ${key}: ${value}`);
		});

		console.log('\n🎯 Server Limits:');
		Object.entries(helloMessage.limits).forEach(([key, value]) => {
			console.log(`  ${key}: ${value}`);
		});
	}

	// Close connection
	setTimeout(() => {
		console.log('\n🔌 Closing connection...');
		ws.close();
		process.exit(0);
	}, 2000);
}

ws.on('error', (error) => {
	console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
	console.log(`🔌 WebSocket closed: ${code} ${reason.toString()}`);
});

// Emergency exit after 30 seconds
setTimeout(() => {
	console.log('⏰ Test timeout - exiting');
	process.exit(1);
}, 30000);
