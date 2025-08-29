"use client"

import * as React from "react"

interface IstioInfo {
  installed: boolean
  used: boolean
  crds?: string[]
  counts?: Record<string, number>
}

export interface ClusterFeaturesState {
  istioInstalled: boolean
  istioUsed: boolean
  istio?: IstioInfo
  loading: boolean
  error: string | null
}

interface ClusterFeaturesContextValue extends ClusterFeaturesState {
  refetch: () => Promise<void>
}

const ClusterFeaturesContext = React.createContext<ClusterFeaturesContextValue | undefined>(undefined)

export function ClusterFeaturesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ClusterFeaturesState>({
    istioInstalled: false,
    istioUsed: false,
    istio: undefined,
    loading: true,
    error: null,
  })

  const fetchFeatures = React.useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const res = await fetch('/api/v1/capabilities', { credentials: 'include' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`)
      }
      const json = await res.json() as { data?: { istio?: IstioInfo } }
      const istio = json?.data?.istio
      setState({
        istioInstalled: Boolean(istio?.installed),
        istioUsed: Boolean(istio?.used),
        istio,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed to load cluster features' }))
    }
  }, [])

  React.useEffect(() => {
    fetchFeatures()
  }, [fetchFeatures])

  const value: ClusterFeaturesContextValue = React.useMemo(() => ({
    ...state,
    refetch: fetchFeatures,
  }), [state, fetchFeatures])

  return (
    <ClusterFeaturesContext.Provider value={value}>
      {children}
    </ClusterFeaturesContext.Provider>
  )
}

export function useClusterFeatures(): ClusterFeaturesContextValue {
  const ctx = React.useContext(ClusterFeaturesContext)
  if (ctx === undefined) {
    if (typeof window === 'undefined') {
      return {
        istioInstalled: false,
        istioUsed: false,
        istio: undefined,
        loading: true,
        error: null,
        refetch: async () => { },
      }
    }
    throw new Error('useClusterFeatures must be used within a ClusterFeaturesProvider')
  }
  return ctx
}

