#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing WebSocket subscription flow...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'cluster-overview-cards',
			res: 'lo',
			since: '15m',
			series: [
				'cluster.nodes.ready',
				'cluster.nodes.count',
				'cluster.pods.running',
				'cluster.pods.pending',
				'cluster.pods.restarts.1h',
				'cluster.pods.failed',
			]
		};

		console.log('📤 Sending subscription:', JSON.stringify(subscription, null, 2));
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
		console.log('📥 Received:', JSON.stringify(message, null, 2));
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
