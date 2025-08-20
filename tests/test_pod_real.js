#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing Pod WebSocket subscription with REAL pod names...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'pod-metrics-real',
			res: 'lo',
			since: '15m',
			series: [
				// Test actual pods from different namespaces
				'pod.cpu.usage.cores.default.test-daemonset-8ghtm',
				'pod.mem.usage.bytes.default.test-daemonset-8ghtm',
				'pod.cpu.usage.cores.kaptn.kaptn-649f87fb98-fdvr6',
				'pod.mem.usage.bytes.kaptn.kaptn-649f87fb98-fdvr6',
				'pod.cpu.usage.cores.default.test-endpoints-ws-86c4d7445c-cs6sh',
				'pod.mem.usage.bytes.default.test-endpoints-ws-86c4d7445c-cs6sh'
			]
		};

		console.log('📤 Sending real pod subscription:', JSON.stringify(subscription, null, 2));
		ws.send(JSON.stringify(subscription));
	}, 1000);

	// Close after 20 seconds
	setTimeout(() => {
		ws.close();
	}, 20000);
});

ws.on('message', (data) => {
	try {
		const message = JSON.parse(data.toString());
		if (message.type === 'hello') {
			console.log('📥 Hello - node capability:', message.capabilities.node, 'pod capability:', message.capabilities.pod);
		} else if (message.type === 'init') {
			console.log('📥 Init - received series keys:', Object.keys(message.data.series || {}));
			console.log('📥 Init - series count:', Object.keys(message.data.series || {}).length);
		} else if (message.type === 'ack') {
			console.log('📥 Ack - accepted:', message.accepted?.length || 0, 'rejected:', message.rejected?.length || 0);
			if (message.rejected?.length > 0) {
				console.log('  Rejected keys:');
				message.rejected.forEach(r => console.log(`    ${r.key}: ${r.reason}`));
			}
			if (message.accepted?.length > 0) {
				console.log('  Accepted keys:');
				message.accepted.forEach(k => console.log(`    ${k}`));
			}
		} else if (message.type === 'append') {
			console.log('📥 Live update for:', message.key, '=', message.point.v);
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
