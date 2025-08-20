#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing Simple Pod WebSocket subscription...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'simple-pod-test',
			res: 'lo',
			since: '5m',
			series: [
				// Try just CPU usage for one pod
				'pod.cpu.usage.cores.default.test-daemonset-8ghtm'
			]
		};

		console.log('📤 Sending simple pod subscription:', JSON.stringify(subscription, null, 2));
		ws.send(JSON.stringify(subscription));
	}, 1000);

	// Close after 10 seconds
	setTimeout(() => {
		console.log('⏰ Closing connection after 10 seconds');
		ws.close();
	}, 10000);
});

ws.on('message', (data) => {
	try {
		const message = JSON.parse(data.toString());
		console.log('📥 Received message:', message.type);

		if (message.type === 'hello') {
			console.log('  Capabilities:', message.capabilities);
		} else if (message.type === 'ack') {
			console.log('  Accepted:', message.accepted?.length || 0, 'Rejected:', message.rejected?.length || 0);
		} else if (message.type === 'error') {
			console.log('  Error:', message.error);
		}
	} catch (error) {
		console.log('📥 Raw message:', data.toString());
	}
});

ws.on('error', (error) => {
	console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
	console.log(`🔌 WebSocket closed: ${code} ${reason.toString()}`);
	if (code === 1009) {
		console.log('  Code 1009 = Message too big');
	}
});
