#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing smaller batch of node metrics...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'small-batch-nodes',
			res: 'lo',
			since: '15m',
			series: [
				// Just try 3 nodes instead of all 5
				'node.cpu.usage.cores.master-1',
				'node.mem.usage.bytes.master-1',
				'node.capacity.cpu.cores.master-1',
				'node.capacity.mem.bytes.master-1',

				'node.cpu.usage.cores.worker-1',
				'node.mem.usage.bytes.worker-1',
				'node.capacity.cpu.cores.worker-1',
				'node.capacity.mem.bytes.worker-1',

				'node.cpu.usage.cores.worker-2',
				'node.mem.usage.bytes.worker-2',
				'node.capacity.cpu.cores.worker-2',
				'node.capacity.mem.bytes.worker-2'
			]
		};

		console.log('📤 Sending subscription (12 series):', JSON.stringify(subscription, null, 2));
		ws.send(JSON.stringify(subscription));
	}, 1000);

	// Close after 10 seconds
	setTimeout(() => {
		ws.close();
	}, 10000);
});

ws.on('message', (data) => {
	try {
		const message = JSON.parse(data.toString());
		if (message.type === 'hello') {
			console.log('📥 Received hello - capabilities:', message.capabilities);
			console.log('📥 Received hello - limits:', message.limits);
		} else if (message.type === 'init') {
			console.log('📥 Received init with series keys:', Object.keys(message.data.series || {}));
		} else if (message.type === 'ack') {
			console.log('📥 Received ack - accepted:', message.accepted?.length || 0, 'rejected:', message.rejected?.length || 0);
			if (message.rejected?.length > 0) {
				console.log('  Rejected keys:', message.rejected.map(r => r.key));
			}
		} else if (message.type === 'append') {
			console.log('📥 Received append for key:', message.key, 'value:', message.point.v);
		} else {
			console.log('📥 Received:', message.type);
		}
	} catch (error) {
		console.log('📥 Received (raw):', data.toString());
	}
});

ws.on('error', (error) => {
	console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
	console.log(`🔌 WebSocket closed: ${code} ${reason.toString()}`);
});
