#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing Namespace WebSocket subscription flow...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'namespace-metrics',
			res: 'lo',
			since: '15m',
			series: [
				// Common namespaces
				'ns.cpu.used.cores.default',
				'ns.mem.used.bytes.default',
				'ns.pods.running.default',
				'ns.cpu.used.cores.kube-system',
				'ns.mem.used.bytes.kube-system',
				'ns.pods.running.kube-system',
				'ns.cpu.used.cores.kube-node-lease',
				'ns.mem.used.bytes.kube-node-lease',
				'ns.pods.running.kube-node-lease',
				'ns.cpu.used.cores.kube-public',
				'ns.mem.used.bytes.kube-public',
				'ns.pods.running.kube-public'
			]
		};

		console.log('📤 Sending namespace subscription:', JSON.stringify(subscription, null, 2));
		ws.send(JSON.stringify(subscription));
	}, 1000);

	// Close after 15 seconds
	setTimeout(() => {
		ws.close();
	}, 15000);
});

ws.on('message', (data) => {
	try {
		const message = JSON.parse(data.toString());
		if (message.type === 'hello') {
			console.log('📥 Received hello - capabilities:', message.capabilities);
		} else if (message.type === 'ack') {
			console.log('📥 Received ack - accepted:', message.accepted?.length || 0, 'rejected:', message.rejected?.length || 0);
			if (message.accepted?.length > 0) {
				console.log('  ✅ Accepted namespace metrics:', message.accepted.slice(0, 5));
			}
			if (message.rejected?.length > 0) {
				console.log('  ❌ Rejected namespace metrics:', message.rejected.map(r => `${r.key} (${r.reason})`));
			}
		} else if (message.type === 'init') {
			const seriesKeys = Object.keys(message.data.series || {});
			console.log('📥 Received init with', seriesKeys.length, 'namespace series');
			if (seriesKeys.length > 0) {
				console.log('  Sample namespace keys:', seriesKeys.slice(0, 5));
			}
		} else if (message.type === 'append') {
			const namespace = message.key.split('.').pop();
			console.log('📥 Live update for namespace:', namespace, 'metric:', message.key.split('.').slice(-2, -1)[0], 'value:', message.point.v.toFixed(2));
		} else {
			console.log('📥 Received:', message.type);
		}
	} catch (error) {
		console.log('📥 Received (raw):', data.toString().substring(0, 100));
	}
});

ws.on('error', (error) => {
	console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
	console.log(`🔌 WebSocket closed: ${code} ${reason.toString()}`);
});
