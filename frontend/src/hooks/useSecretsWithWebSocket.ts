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
		const keyCount = typeof wsData.keyCount === 'number' ? wsData.keyCount : 
			typeof wsData.keysCount === 'number' ? wsData.keysCount : 0;
		const keys = Array.isArray(wsData.keys) ? wsData.keys as string[] : [];
		
		// Calculate estimated data size
		const estimatedSizeBytes = keyCount * 512; // Rough estimate
		const dataSize = estimatedSizeBytes < 1024 ? `${estimatedSizeBytes} B` :
			estimatedSizeBytes < 1024 * 1024 ? `${(estimatedSizeBytes / 1024).toFixed(1)} KB` :
			`${(estimatedSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

		// Handle labels and annotations
		const labels = wsData.labels as Record<string, string> | null;
		const annotations = wsData.annotations as Record<string, string> | null;
		const labelsCount = labels ? Object.keys(labels).length : 0;
		const annotationsCount = annotations ? Object.keys(annotations).length : 0;

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
			keysCount: keyCount,
			dataSize: dataSize,
			dataSizeBytes: estimatedSizeBytes,
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
