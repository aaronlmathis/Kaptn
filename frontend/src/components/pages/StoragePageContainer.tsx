"use client";

import * as React from "react";
import { RouteGuard } from "@/components/authz";
import { useNavigation } from "@/contexts/navigation-context";
import { usePersistentVolumeClaims, usePersistentVolumes, useStorageClasses } from "@/hooks/use-k8s-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";

function StorageContent() {
  const { setPageTitle, isHydrated } = useNavigation();
  React.useEffect(() => {
    if (isHydrated) setPageTitle("Storage");
  }, [isHydrated, setPageTitle]);

  const { data: pvcs = [] } = usePersistentVolumeClaims();
  const { data: pvs = [] } = usePersistentVolumes();
  const { data: scs = [] } = useStorageClasses();

  const pvcBound = React.useMemo(() => pvcs.filter(p => (p.status || '').toLowerCase() === 'bound').length, [pvcs]);
  const pvcTotal = pvcs.length;
  const pvcPct = pvcTotal > 0 ? pvcBound / pvcTotal : undefined;

  const topVolumes = React.useMemo(() => {
    // Placeholder: sort by capacity string (best-effort) descending
    const parseGi = (s: string) => {
      const m = /([\d.]+)/.exec(s || '');
      return m ? parseFloat(m[1]) : 0;
    };
    return [...pvs]
      .sort((a, b) => parseGi(b.capacity) - parseGi(a.capacity))
      .slice(0, 5);
  }, [pvs]);

  const defaultSC = scs.find(s => s.isDefault);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 lg:px-6">
      {/* PVC Usage Overview */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">PVC Usage Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionHealthFooter
            tone={typeof pvcPct === 'number' && pvcPct < 0.7 ? 'warn' : 'ok'}
            summary={`${pvcBound}/${pvcTotal} PVCs bound`}
            usedPct={pvcPct}
            ratioPills={[
              { label: 'Bound', value: String(pvcBound) },
              { label: 'Unbound', value: String(Math.max(0, pvcTotal - pvcBound)), tone: pvcTotal - pvcBound > 0 ? 'warn' : 'ok' },
            ]}
          >
            Monitor unbound claims; verify StorageClass and capacity
          </SectionHealthFooter>
          <div className="mt-2">
            <Button asChild variant="link" className="px-0 h-6"><a href="/storage/persistent-volume-claims">View PVCs →</a></Button>
          </div>
        </CardContent>
      </Card>

      {/* Top Volumes by Capacity (placeholder for IO) */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Top Volumes by Capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topVolumes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No volumes found</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {topVolumes.map(v => (
                <li key={v.name} className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">{v.capacity}</Badge>
                  <span className="font-medium truncate">{v.name}</span>
                  <span className="text-muted-foreground">· {v.storageClass}</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="link" className="px-0 h-6"><a href="/storage/persistent-volumes">View PVs →</a></Button>
        </CardContent>
      </Card>

      {/* Storage Classes quick list */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Storage Classes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">Total: <span className="font-medium">{scs.length}</span></div>
          {defaultSC ? (
            <div className="text-sm">Default: <Badge variant="outline">{defaultSC.name}</Badge></div>
          ) : (
            <div className="text-sm text-muted-foreground">No default class set</div>
          )}
          <Button asChild variant="link" className="px-0 h-6"><a href="/storage/storage-classes">Manage Storage Classes →</a></Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function StoragePageContainer() {
  return (
    <RouteGuard requiredCapabilities={["persistentvolumeclaims.list", "persistentvolumes.list"]} requireAll={false}>
      <StorageContent />
    </RouteGuard>
  );
}
