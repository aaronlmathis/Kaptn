import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { z } from 'zod';
import { gatewaySchema, type GatewayApiItem } from '@/types/gateway';

/**
 * Enhanced gateways hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useGatewaysWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchGateways = useCallback(async (): Promise<z.infer<typeof gatewaySchema>[]> => {
		const url = selectedNamespace === "all"
			? "/api/v1/istio/gateways"
			: `/api/v1/istio/gateways?namespace=${selectedNamespace}`;

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch gateways: ${response.statusText}`);
		}

		const result = await response.json();
		if (result.status === 'success') {
			return result.data.items.map((item: GatewayApiItem, index: number) => ({
				id: index + 1,
				name: item.name,
				namespace: item.namespace,
				ports: item.ports || [],
				addresses: item.addresses || null,
				labels: item.labels || null,
				age: item.age || 'Unknown',
			}));
		} else {
			throw new Error(result.error || 'Failed to fetch gateways');
		}
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: any): z.infer<typeof gatewaySchema> => { // eslint-disable-line @typescript-eslint/no-explicit-any
		// The WebSocket data comes from the informer which has the structure defined in gateways.go
		// Transform it to match the gateway schema

		// Calculate age from creation timestamp
		const calculateAge = (creationTimestamp?: string): string => {
			if (!creationTimestamp) return 'Unknown';

			const ageMs = Date.now() - new Date(creationTimestamp).getTime();
			const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
			const ageHours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

			if (ageDays > 0) {
				return `${ageDays}d`;
			} else if (ageHours > 0) {
				return `${ageHours}h`;
			} else {
				return `${ageMinutes}m`;
			}
		};

		return {
			id: `${wsData.namespace}-${wsData.name}`.hashCode(), // Simple hash for ID
			name: wsData.name || '',
			namespace: wsData.namespace || '',
			ports: wsData.ports || [],
			addresses: wsData.addresses || null,
			labels: wsData.labels || null,
			age: calculateAge(wsData.creationTimestamp)
		};
	}, []);

	// Key function for identifying unique gateways
	const getItemKey = useCallback((gateway: z.infer<typeof gatewaySchema>) => {
		return `${gateway.namespace}/${gateway.name}`;
	}, []);

	const result = useResourceWithOverview<z.infer<typeof gatewaySchema>>('gateways', {
		fetchData: fetchGateways,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false // Debug disabled
	});

	return result;
}

// Extension to String prototype for simple hash code (for generating IDs)
declare global {
	interface String {
		hashCode(): number;
	}
}

String.prototype.hashCode = function () {
	let hash = 0;
	if (this.length === 0) return hash;
	for (let i = 0; i < this.length; i++) {
		const char = this.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
};
