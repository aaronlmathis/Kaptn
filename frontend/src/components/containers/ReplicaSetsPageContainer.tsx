"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ReplicaSetsDataTable } from "@/components/data_tables/ReplicaSetsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useReplicaSetsWithWebSocket } from "@/hooks/useReplicaSetsWithWebSocket"
import {
  getReplicaStatusBadge,
  getUpdateStatusBadge,
  getResourceIcon,
  getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function ReplicaSetsContent() {
  const { data: replicaSets, loading: isLoading, error, isConnected } = useReplicaSetsWithWebSocket(true)
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

  // Update lastUpdated when replicaSets change
  React.useEffect(() => {
    if (replicaSets.length > 0) {
      setLastUpdated(new Date().toISOString())
    }
  }, [replicaSets])

  // Generate summary cards from replicaset data
  const summaryData: SummaryCard[] = React.useMemo(() => {
    if (!replicaSets || replicaSets.length === 0) {
      return [
        {
          title: "Total ReplicaSets",
          value: 0,
          subtitle: "No replicasets found"
        },
        {
          title: "Ready",
          value: 0,
          subtitle: "0/0 ready"
        },
        {
          title: "Available",
          value: 0,
          subtitle: "0 available"
        },
        {
          title: "Current",
          value: 0,
          subtitle: "0 current replicas"
        }
      ]
    }

    const totalReplicaSets = replicaSets.length

    // Calculate ready replicasets (where ready fraction equals 1)
    const readyReplicaSets = replicaSets.filter(rs => {
      const [ready, total] = rs.ready.split('/').map(Number)
      return ready === total && total > 0
    }).length

    // Calculate total replica stats
    const totalAvailable = replicaSets.reduce((sum, rs) => sum + rs.available, 0)
    const totalCurrent = replicaSets.reduce((sum, rs) => sum + rs.current, 0)
    const totalDesired = replicaSets.reduce((sum, rs) => rs.desired, 0)
    const totalReady = replicaSets.reduce((sum, rs) => {
      const [ready] = rs.ready.split('/').map(Number)
      return sum + (ready || 0)
    }, 0)

    return [
      {
        title: "Total ReplicaSets",
        value: totalReplicaSets,
        subtitle: `${readyReplicaSets}/${totalReplicaSets} ready`,
        badge: getReplicaStatusBadge(readyReplicaSets, totalReplicaSets),
        icon: getResourceIcon("replicasets"),
        footer: totalReplicaSets > 0 ? "All replicaset resources in cluster" : "No replicasets found"
      },
      {
        title: "Ready Replicas",
        value: `${totalReady}/${totalDesired}`,
        subtitle: totalDesired > 0 ? `${Math.round((totalReady / totalDesired) * 100)}% ready` : "No replicas",
        badge: getReplicaStatusBadge(totalReady, totalDesired),
        footer: totalDesired > 0 ? "Pod instances across all replicasets" : "No pod replicas"
      },
      {
        title: "Available",
        value: totalAvailable,
        subtitle: `${totalAvailable} replicas available`,
        badge: getHealthTrendBadge(totalDesired > 0 ? (totalAvailable / totalDesired) * 100 : 0),
        footer: totalAvailable > 0 ? "Ready to serve traffic" : "No available replicas"
      },
      {
        title: "Current",
        value: totalCurrent,
        subtitle: `${totalCurrent} current replicas`,
        badge: getUpdateStatusBadge(totalCurrent, totalDesired),
        footer: totalCurrent > 0 ? "Currently running replicas" : "No current replicas"
      }
    ]
  }, [replicaSets])

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">ReplicaSets</h1>
            {isConnected && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Real-time updates enabled</span>
              </div>
            )}
          </div>
          <p className="text-muted-foreground">
            Manage and monitor ReplicaSet resources in your Kubernetes cluster
          </p>
        </div>
      </div>

      <SummaryCards
        cards={summaryData}
        loading={isLoading}
        error={error}
        lastUpdated={lastUpdated}
      />

      <ReplicaSetsDataTable />
    </>
  )
}

export function ReplicaSetsPageContainer() {
  return (
    <SharedProviders>
      <ReplicaSetsContent />
    </SharedProviders>
  )
} 
