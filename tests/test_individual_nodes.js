#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing individual node metrics availability...');

// Test each node individually to see which ones have metrics
const nodes = ['master-1', 'worker-1', 'worker-2', 'worker-3', 'worker-4'];
let testIndex = 0;

function testNextNode() {
	if (testIndex >= nodes.length) {
		console.log('✅ All node tests completed');
		return;
	}

	const nodeName = nodes[testIndex];
	console.log(`\n🔍 Testing node: ${nodeName}`);

	const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

	ws.on('open', () => {
		console.log(`✅ Connected for ${nodeName}`);

		setTimeout(() => {
			const subscription = {
				type: 'subscribe',
				groupId: `test-${nodeName}`,
				res: 'lo',
				since: '15m',
				series: [
					`node.cpu.usage.cores.${nodeName}`,
					`node.capacity.cpu.cores.${nodeName}`,
					`node.mem.usage.bytes.${nodeName}`,
					`node.capacity.mem.bytes.${nodeName}`
				]
			};

			console.log(`📤 Sending subscription for ${nodeName}`);
			ws.send(JSON.stringify(subscription));
		}, 1000);

		setTimeout(() => {
			ws.close();
		}, 5000);
	});

	ws.on('message', (data) => {
		try {
			const message = JSON.parse(data.toString());
			if (message.type === 'ack') {
				console.log(`📥 ${nodeName} ack - accepted: ${message.accepted?.length || 0}, rejected: ${message.rejected?.length || 0}`);
				if (message.rejected?.length > 0) {
					console.log(`  ${nodeName} rejected:`, message.rejected.map(r => r.key));
				}
			} else if (message.type === 'init') {
				console.log(`📥 ${nodeName} init with ${Object.keys(message.data.series || {}).length} series`);
			} else if (message.type === 'append') {
				console.log(`📥 ${nodeName} append: ${message.key} = ${message.point.v}`);
			}
		} catch (error) {
			console.log(`📥 ${nodeName} received (raw):`, data.toString());
		}
	});

	ws.on('error', (error) => {
		console.error(`❌ ${nodeName} WebSocket error:`, error.message);
		testIndex++;
		setTimeout(testNextNode, 1000);
	});

	ws.on('close', (code, reason) => {
		console.log(`🔌 ${nodeName} WebSocket closed: ${code} ${reason.toString()}`);
		testIndex++;
		setTimeout(testNextNode, 1000);
	});
}

testNextNode();
