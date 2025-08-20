#!/usr/bin/env node

/**
 * WebSocket Connection Test Script
 * 
 * Tests both WebSocket endpoints to identify the issue
 */

const WebSocket = require('ws');

async function testWebSocket(url, name, messageHandler) {
	return new Promise((resolve, reject) => {
		console.log(`\n🔌 Testing ${name}: ${url}`);

		const ws = new WebSocket(url);
		const timeout = setTimeout(() => {
			console.log(`❌ ${name}: Connection timeout`);
			ws.close();
			reject(new Error('Connection timeout'));
		}, 10000);

		ws.on('open', () => {
			console.log(`✅ ${name}: Connected successfully`);
			clearTimeout(timeout);

			// Send test message based on endpoint type
			if (messageHandler) {
				messageHandler(ws);
			}
		});

		ws.on('message', (data) => {
			try {
				const message = JSON.parse(data.toString());
				console.log(`📨 ${name}: Received message:`, JSON.stringify(message, null, 2));

				if (message.type === 'hello') {
					// For new endpoint, send subscribe message
					const subscribeMsg = {
						type: 'subscribe',
						groupId: 'test-group',
						res: 'hi',
						since: '5m',
						series: ['cluster.cpu.used.cores', 'cluster.mem.used.bytes']
					};
					console.log(`📤 ${name}: Sending subscribe:`, JSON.stringify(subscribeMsg, null, 2));
					ws.send(JSON.stringify(subscribeMsg));
				}

				if (message.type === 'ack') {
					console.log(`✅ ${name}: Subscription acknowledged`);
					setTimeout(() => {
						ws.close();
						resolve();
					}, 2000);
				}

				if (message.type === 'init') {
					console.log(`📊 ${name}: Received initial data`);
					setTimeout(() => {
						ws.close();
						resolve();
					}, 2000);
				}

			} catch (error) {
				console.log(`❌ ${name}: Failed to parse message:`, data.toString());
			}
		});

		ws.on('error', (error) => {
			console.log(`❌ ${name}: WebSocket error:`, error.message);
			clearTimeout(timeout);
			reject(error);
		});

		ws.on('close', (code, reason) => {
			console.log(`🔌 ${name}: Connection closed (${code}): ${reason}`);
			clearTimeout(timeout);
			resolve();
		});
	});
}

async function main() {
	console.log('🧪 WebSocket Connection Test');
	console.log('============================');

	try {
		// Test new unified endpoint
		await testWebSocket('ws://localhost:9999/api/v1/timeseries/live', 'New Unified Endpoint');

		// Test old cluster endpoint  
		await testWebSocket('ws://localhost:9999/api/v1/timeseries/cluster/live', 'Old Cluster Endpoint');

		console.log('\n✅ All tests completed');

	} catch (error) {
		console.error('\n❌ Test failed:', error.message);
		process.exit(1);
	}
}

main();
