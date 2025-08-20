#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔌 Testing CapacityHeadroom component subscription pattern...');

// Simulate what the frontend does:
// 1. First subscribe to cluster metrics
// 2. Then subscribe to node metrics

let ws1, ws2;

// Step 1: Subscribe to cluster metrics (this should work)
console.log('📊 Step 1: Subscribing to cluster metrics...');
ws1 = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

ws1.on('open', () => {
	console.log('✅ Cluster WebSocket connected');

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

		console.log('📤 Sending cluster subscription:', JSON.stringify(clusterSubscription, null, 2));
		ws1.send(JSON.stringify(clusterSubscription));
	}, 1000);
});

ws1.on('message', (data) => {
	try {
		const message = JSON.parse(data.toString());
		if (message.type === 'ack') {
			console.log('📥 Cluster ack - accepted:', message.accepted?.length || 0, 'rejected:', message.rejected?.length || 0);
			if (message.rejected?.length > 0) {
				console.log('  Cluster rejected keys:', message.rejected.map(r => r.key));
			}
			
			// After cluster subscription succeeds, try node subscription
			setTimeout(() => {
				console.log('\n📊 Step 2: Subscribing to node metrics...');
				startNodeSubscription();
			}, 2000);
		} else if (message.type === 'init') {
			console.log('📥 Cluster init with series keys:', Object.keys(message.data.series || {}));
		} else {
			console.log('📥 Cluster received:', message.type);
		}
	} catch (error) {
		console.log('📥 Cluster received (raw):', data.toString());
	}
});

ws1.on('error', (error) => {
	console.error('❌ Cluster WebSocket error:', error.message);
});

function startNodeSubscription() {
	ws2 = new WebSocket('ws://localhost:9999/api/v1/timeseries/live');

	ws2.on('open', () => {
		console.log('✅ Node WebSocket connected');

		setTimeout(() => {
			// Try the exact same pattern as CapacityHeadroom - all 5 nodes
			const nodeSubscription = {
				type: 'subscribe',
				groupId: 'capacity-headroom-nodes',
				res: 'lo',
				since: '30m',
				series: [
					// All 5 nodes discovered by API
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
					'node.capacity.mem.bytes.worker-2',
					
					'node.cpu.usage.cores.worker-3',
					'node.capacity.cpu.cores.worker-3',
					'node.mem.usage.bytes.worker-3',
					'node.capacity.mem.bytes.worker-3',
					
					'node.cpu.usage.cores.worker-4',
					'node.capacity.cpu.cores.worker-4',
					'node.mem.usage.bytes.worker-4',
					'node.capacity.mem.bytes.worker-4'
				]
			};

			console.log('📤 Sending node subscription (20 series):', JSON.stringify(nodeSubscription, null, 2));
			ws2.send(JSON.stringify(nodeSubscription));
		}, 1000);

		// Close both connections after 15 seconds
		setTimeout(() => {
			console.log('\n🔌 Closing connections...');
			ws1.close();
			ws2.close();
		}, 15000);
	});

	ws2.on('message', (data) => {
		try {
			const message = JSON.parse(data.toString());
			if (message.type === 'ack') {
				console.log('📥 Node ack - accepted:', message.accepted?.length || 0, 'rejected:', message.rejected?.length || 0);
				if (message.rejected?.length > 0) {
					console.log('  Node rejected keys:', message.rejected.map(r => r.key));
				}
			} else if (message.type === 'init') {
				console.log('📥 Node init with series keys:', Object.keys(message.data.series || {}));
			} else if (message.type === 'append') {
				console.log('📥 Node append for key:', message.key, 'value:', message.point.v);
			} else {
				console.log('📥 Node received:', message.type);
			}
		} catch (error) {
			console.log('📥 Node received (raw):', data.toString());
		}
	});

	ws2.on('error', (error) => {
		console.error('❌ Node WebSocket error:', error.message);
	});

	ws2.on('close', (code, reason) => {
		console.log(`🔌 Node WebSocket closed: ${code} ${reason.toString()}`);
	});
}

ws1.on('close', (code, reason) => {
	console.log(`🔌 Cluster WebSocket closed: ${code} ${reason.toString()}`);
});
