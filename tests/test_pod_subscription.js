#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing Pod WebSocket subscription flow...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'pod-metrics',
			res: 'lo',
			since: '15m',
			series: [
				// Try some pod metrics from kube-system namespace
				'pod.cpu.usage.cores.kube-system.coredns-7db6d8ff4d-j8k2m',
				'pod.mem.usage.bytes.kube-system.coredns-7db6d8ff4d-j8k2m',
				'pod.cpu.usage.cores.kube-system.etcd-master-1',
				'pod.mem.usage.bytes.kube-system.etcd-master-1',
				// Try some from default namespace
				'pod.cpu.usage.cores.default.nginx-deployment-cb84d5d8f-xyz123',
				'pod.mem.usage.bytes.default.nginx-deployment-cb84d5d8f-xyz123'
			]
		};

		console.log('📤 Sending pod subscription:', JSON.stringify(subscription, null, 2));
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
				console.log('  ✅ Accepted pod metrics:', message.accepted.slice(0, 3));
			}
			if (message.rejected?.length > 0) {
				console.log('  ❌ Rejected pod metrics:', message.rejected.map(r => `${r.key} (${r.reason})`));
			}
		} else if (message.type === 'init') {
			const seriesKeys = Object.keys(message.data.series || {});
			console.log('📥 Received init with', seriesKeys.length, 'pod series');
			if (seriesKeys.length > 0) {
				console.log('  Sample keys:', seriesKeys.slice(0, 3));
			}
		} else if (message.type === 'append') {
			console.log('📥 Live update for pod:', message.key.split('.').slice(-2).join('/'), 'value:', message.point.v.toFixed(4));
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
