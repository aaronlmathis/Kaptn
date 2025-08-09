import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getConfigMaps, transformConfigMapsToUI, type DashboardConfigMap } from '@/lib/k8s-storage';

/**
 * Enhanced config maps hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useConfigMapsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchConfigMaps = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const configMaps = await getConfigMaps(namespace);
		return transformConfigMapsToUI(configMaps);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardConfigMap => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// ConfigMap-specific field transformations
		const dataKeysCount = typeof wsData.dataKeysCount === 'number' ? wsData.dataKeysCount : 0;
		const dataSize = typeof wsData.dataSize === 'string' ? wsData.dataSize : '0 B';
		const dataSizeBytes = typeof wsData.dataSizeBytes === 'number' ? wsData.dataSizeBytes : 0;
		const dataKeys = Array.isArray(wsData.dataKeys) ? wsData.dataKeys as string[] : [];
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
			age: age,
			dataKeysCount: dataKeysCount,
			dataSize: dataSize,
			dataSizeBytes: dataSizeBytes,
			dataKeys: dataKeys,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
		};
	}, []);

	// Key function for identifying unique config maps
	const getItemKey = useCallback((configMap: DashboardConfigMap) => {
		return `${configMap.namespace}/${configMap.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardConfigMap>('configmaps', {
		fetchData: fetchConfigMaps,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false
	});

	return result;
}
