export interface HPAView {
  namespace: string
  name: string
  targetKind: string
  targetName: string
  minReplicas?: number
  maxReplicas: number
  desiredReplicas: number
  currentReplicas: number
  lastScaleTime?: string
  primaryMetric?: {
    type: string
    resourceName?: string
    targetDesc: string
  }
  conditions?: Array<{
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }>
  signals: {
    atMax: boolean
    limited: boolean
    thrashScore: number
  }
}

export interface DashboardHPA {
  id: number
  name: string
  namespace: string
  target: string // kind/name
  min: number
  max: number
  desired: number
  current: number
  status: 'atMax' | 'limited' | 'active' | 'none'
  lastScale?: string
}

