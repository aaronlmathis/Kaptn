"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { DashboardLayout } from "@/components/dashboard-layout"
import { RBACPageContainer } from "@/components/containers/RbacPageContainer"

export function RBACPage() {
  return (
    <SharedProviders>
      <DashboardLayout>
        <RBACPageContainer />
      </DashboardLayout>
    </SharedProviders>
  )
}

