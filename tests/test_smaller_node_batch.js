#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing with smaller node batch on same connection...');

const ws = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws.on('open', () => {
	console.log('✅ WebSocket connected');

	// Step 1: Subscribe to cluster metrics first
	setTimeout(() => {
		const clusterSubscription = {
			type: 'subscribe',
			groupId: 'capacity-headroom',
			res: 'lo',
			since: '30m',
			series: [
				"cluster.cpu.used.cores",
				"cluster.cpu.limits.cores",
				"cluster.mem.used.bytes",
				"cluster.mem.limits.bytes",
				"cluster.mem.capacity.bytes",
				"cluster.mem.allocatable.bytes",
				"cluster.fs.image.used.bytes",
				"cluster.fs.image.capacity.bytes"
			]
		};

		console.log('📤 Sending cluster subscription (8 series)...');
		ws.send(JSON.stringify(clusterSubscription));
	}, 1000);

	// Step 2: Subscribe to ONLY 3 nodes instead of all 5
	let clusterAckReceived = false;

	ws.on('message', (data) => {
		try {
			const message = JSON.parse(data.toString());

			if (message.type === 'ack' && message.groupId === 'capacity-headroom' && !clusterAckReceived) {
				clusterAckReceived = true;
				console.log('📥 Cluster ack received, now sending smaller node subscription...');

				setTimeout(() => {
					const nodeSubscription = {
						type: 'subscribe',
						groupId: 'capacity-headroom-nodes',
						res: 'lo',
						since: '30m',
						series: [
							// Only 3 nodes (12 series total)
							'node.cpu.usage.cores.master-1',
							'node.capacity.cpu.cores.master-1',
							'node.mem.usage.bytes.master-1',
							'node.capacity.mem.bytes.master-1',

							'node.cpu.usage.cores.worker-1',
							'node.capacity.cpu.cores.worker-1',
							'node.mem.usage.bytes.worker-1',
							'node.capacity.mem.bytes.worker-1',

							'node.cpu.usage.cores.worker-2',
							'node.capacity.cpu.cores.worker-2',
							'node.mem.usage.bytes.worker-2',
							'node.capacity.mem.bytes.worker-2'
						]
					};

					console.log('📤 Sending node subscription (12 series) on SAME connection...');
					console.log('📊 Total series now: 8 cluster + 12 node = 20 series');
					ws.send(JSON.stringify(nodeSubscription));
				}, 1000);
			} else if (message.type === 'ack') {
				console.log(`📥 Ack for ${message.groupId} - accepted: ${message.accepted?.length || 0}, rejected: ${message.rejected?.length || 0}`);
				if (message.rejected?.length > 0) {
					console.log(`  Rejected:`, message.rejected.map(r => r.key));
				}
			} else if (message.type === 'init') {
				console.log(`📥 Init for ${message.groupId} with ${Object.keys(message.data.series || {}).length} series`);
			} else if (message.type === 'append') {
				console.log(`📥 Append: ${message.key}`);
			} else {
				console.log(`📥 Received: ${message.type}`);
			}
		} catch (error) {
			console.log('📥 Received (raw):', data.toString());
		}
	});

	// Close after 15 seconds
	setTimeout(() => {
		console.log('\n🔌 Closing connection...');
		ws.close();
	}, 15000);
});

ws.on('error', (error) => {
	console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
	console.log(`🔌 WebSocket closed: ${code} ${reason.toString()}`);
});
