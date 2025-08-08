"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ReplicaSetsDataTable } from "@/components/data_tables/ReplicaSetsDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function ReplicaSetsPageContainer() {
  const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('replicasets')

  return (
    <SharedProviders>
      <div className="px-4 lg:px-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">ReplicaSets</h1>
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
    </SharedProviders>
  )
} 
