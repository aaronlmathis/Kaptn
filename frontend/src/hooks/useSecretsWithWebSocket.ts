import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getSecrets, transformSecretsToUI, type DashboardSecret } from '@/lib/k8s-storage';

/**
 * Enhanced secrets hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useSecretsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchSecrets = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const secrets = await getSecrets(namespace);
		return transformSecretsToUI(secrets);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardSecret => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// Secret-specific field transformations
		const type = typeof wsData.type === 'string' ? wsData.type : 'Opaque';
		const keysCount = typeof wsData.keysCount === 'number' ? wsData.keysCount : 0;
		const dataSize = typeof wsData.dataSize === 'string' ? wsData.dataSize : '0 B';
		const dataSizeBytes = typeof wsData.dataSizeBytes === 'number' ? wsData.dataSizeBytes : 0;
		const keys = Array.isArray(wsData.keys) ? wsData.keys as string[] : [];
		const labelsCount = typeof wsData.labelsCount === 'number' ? wsData.labelsCount : 0;
		const annotationsCount = typeof wsData.annotationsCount === 'number' ? wsData.annotationsCount : 0;

		// Calculate age from creation timestamp
		const ageMs = Date.now() - new Date(creationTimestamp).getTime();
		const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
		const ageHours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

		let age: string;
		if (ageDays > 0) {
			age = `${ageDays}d`;
		} else if (ageHours > 0) {
			age = `${ageHours}h`;
		} else {
			age = `${ageMinutes}m`;
		}

		return {
			id: `${namespace}-${name}`,
			name: name,
			namespace: namespace,
			type: type,
			keysCount: keysCount,
			dataSize: dataSize,
			dataSizeBytes: dataSizeBytes,
			keys: keys,
			age: age,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
		};
	}, []);

	// Key function for identifying unique secrets
	const getItemKey = useCallback((secret: DashboardSecret) => {
		return `${secret.namespace}/${secret.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardSecret>('secrets', {
		fetchData: fetchSecrets,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false
	});

	return result;
}
