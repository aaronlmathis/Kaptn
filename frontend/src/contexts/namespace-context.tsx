"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import { k8sService, type Namespace } from '@/lib/k8s-api'

export interface NamespaceContextValue {
  selectedNamespace: string
  namespaces: Namespace[]
  loading: boolean
  error: string | null
  setSelectedNamespace: (namespace: string) => void
  refetchNamespaces: () => Promise<void>
}

const NamespaceContext = createContext<NamespaceContextValue | undefined>(undefined)

interface NamespaceProviderProps {
  children: React.ReactNode
}

export function NamespaceProvider({ children }: NamespaceProviderProps) {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all')
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNamespaces = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await k8sService.getNamespaces()
      setNamespaces(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch namespaces')
      console.error('Error fetching namespaces:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNamespaces()
  }, [])

  const contextValue: NamespaceContextValue = {
    selectedNamespace,
    namespaces,
    loading,
    error,
    setSelectedNamespace,
    refetchNamespaces: fetchNamespaces,
  }

  return (
    <NamespaceContext.Provider value={contextValue}>
      {children}
    </NamespaceContext.Provider>
  )
}

export function useNamespace() {
  const context = useContext(NamespaceContext)
  if (context === undefined) {
    throw new Error('useNamespace must be used within a NamespaceProvider')
  }
  return context
}
