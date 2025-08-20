#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing Pod WebSocket subscription with real pod names...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Send subscription after hello
	setTimeout(() => {
		const subscription = {
			type: 'subscribe',
			groupId: 'real-pod-metrics',
			res: 'lo',
			since: '15m',
			series: [
				// Use actual pod names that exist
				'pod.cpu.usage.cores.kube-system.calico-node-58ws8',
				'pod.mem.usage.bytes.kube-system.calico-node-58ws8',
				'pod.cpu.usage.cores.default.test-endpoints-ws-86c4d7445c-cs6sh',
				'pod.mem.usage.bytes.default.test-endpoints-ws-86c4d7445c-cs6sh',
				'pod.cpu.usage.cores.kaptn.kaptn-649f87fb98-fdvr6',
				'pod.mem.usage.bytes.kaptn.kaptn-649f87fb98-fdvr6',
				'pod.cpu.limit.cores.kaptn.kaptn-649f87fb98-fdvr6',
				'pod.mem.limit.bytes.kaptn.kaptn-649f87fb98-fdvr6'
			]
		};

		console.log('📤 Sending real pod subscription:', JSON.stringify(subscription, null, 2));
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
				console.log('  Sample pod keys:', seriesKeys.slice(0, 3));
				// Show sample data points
				const firstKey = seriesKeys[0];
				const points = message.data.series[firstKey];
				if (points && points.length > 0) {
					console.log(`  Sample data for ${firstKey}: ${points.length} points, latest value: ${points[points.length - 1].v}`);
				}
			}
		} else if (message.type === 'append') {
			const parts = message.key.split('.');
			const namespace = parts[parts.length - 2];
			const podName = parts[parts.length - 1];
			const metric = parts.slice(-3, -2)[0];
			console.log(`📥 Live update: ${namespace}/${podName} ${metric}=${message.point.v.toFixed(6)}`);
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
