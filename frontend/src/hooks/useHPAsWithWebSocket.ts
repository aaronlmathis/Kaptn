import { useCallback } from 'react';
import { useNamespace } from '@/contexts/namespace-context';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getHPAs, transformHPAsToUI } from '@/lib/k8s-workloads';
import type { DashboardHPA } from '@/types/hpa';

export function useHPAsWithWebSocket(enableWebSocket: boolean = true) {
  const { selectedNamespace } = useNamespace();

  const fetchHPAs = useCallback(async () => {
    const ns = selectedNamespace === 'all' ? undefined : selectedNamespace;
    const items = await getHPAs(ns);
    return transformHPAsToUI(items);
  }, [selectedNamespace]);

  const transformWebSocketData = useCallback((wsData: any): DashboardHPA => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const min = typeof wsData.minReplicas === 'number' ? wsData.minReplicas : 0;
    const status: DashboardHPA['status'] = wsData.signals?.atMax
      ? 'atMax'
      : wsData.signals?.limited
        ? 'limited'
        : (wsData.desiredReplicas !== wsData.currentReplicas ? 'active' : 'none');

    return {
      id: `${wsData.namespace}-${wsData.name}`.hashCode(),
      name: wsData.name,
      namespace: wsData.namespace,
      target: `${wsData.targetKind}/${wsData.targetName}`,
      min,
      max: wsData.maxReplicas ?? 0,
      desired: wsData.desiredReplicas ?? 0,
      current: wsData.currentReplicas ?? 0,
      status,
      lastScale: wsData.lastScaleTime,
    };
  }, []);

  const getItemKey = useCallback((item: DashboardHPA) => `${item.namespace}/${item.name}`, []);

  const result = useResourceWithOverview<DashboardHPA>('hpas', {
    fetchData: fetchHPAs,
    transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
    getItemKey,
    fetchDependencies: [selectedNamespace],
    debug: false,
  });

  return result;
}

declare global {
  interface String { hashCode(): number }
}

String.prototype.hashCode = function () {
  let hash = 0;
  if (this.length === 0) return hash;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

