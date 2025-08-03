import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import { rest } from 'msw'

// Mock data for tests
export const mockNamespaces = [
  {
    metadata: {
      name: 'default',
      creationTimestamp: '2023-01-01T00:00:00Z',
      labels: {},
    },
    status: {
      phase: 'Active',
    },
  },
  {
    metadata: {
      name: 'kube-system',
      creationTimestamp: '2023-01-01T00:00:00Z',
      labels: {},
    },
    status: {
      phase: 'Active',
    },
  },
  {
    metadata: {
      name: 'test-namespace',
      creationTimestamp: '2023-01-01T00:00:00Z',
      labels: {},
    },
    status: {
      phase: 'Active',
    },
  },
]

export const mockPods = [
  {
    name: 'test-pod-1',
    namespace: 'default',
    phase: 'Running',
    ready: '1/1',
    node: 'node-1',
    podIP: '10.244.1.5',
    age: '2h',
    creationTimestamp: '2023-01-01T10:00:00Z',
    restartCount: 0,
    labels: { app: 'test-app' },
    cpu: { milli: 100 },
    memory: { bytes: 134217728 },
  },
  {
    name: 'test-pod-2',
    namespace: 'test-namespace',
    phase: 'Running',
    ready: '1/1',
    node: 'node-2',
    podIP: '10.244.2.5',
    age: '1h',
    creationTimestamp: '2023-01-01T11:00:00Z',
    restartCount: 1,
    labels: { app: 'another-app' },
    cpu: { milli: 200 },
    memory: { bytes: 268435456 },
  },
]

// Setup MSW server for API mocking
export const server = setupServer(
  // Namespaces endpoint
  rest.get('/api/v1/namespaces', (req, res, ctx) => {
    return res(ctx.json(mockNamespaces))
  }),

  // Pods endpoint - all namespaces
  rest.get('/api/v1/pods', (req, res, ctx) => {
    const namespace = req.url.searchParams.get('namespace')
    let filteredPods = mockPods

    if (namespace && namespace !== 'all') {
      filteredPods = mockPods.filter(pod => pod.namespace === namespace)
    }

    return res(
      ctx.json({
        data: {
          items: filteredPods,
          total: filteredPods.length,
          page: 1,
          pageSize: 25,
        },
        status: 'success',
      })
    )
  }),

  // Services endpoint
  rest.get('/api/v1/services', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
        },
        status: 'success',
      })
    )
  }),

  // Deployments endpoint
  rest.get('/api/v1/deployments', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
        },
        status: 'success',
      })
    )
  }),

  // Nodes endpoint
  rest.get('/api/v1/nodes', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          items: [],
          total: 0,
          page: 1,
          pageSize: 25,
        },
        status: 'success',
      })
    )
  }),

  // Overview endpoint
  rest.get('/api/v1/overview', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          pods: { running: 2, total: 2, pending: 0 },
          nodes: { ready: 2, total: 2 },
          cpu: { usagePercent: 45 },
          memory: { usagePercent: 60 },
          advisories: [],
          asOf: new Date().toISOString(),
        },
        status: 'success',
      })
    )
  })
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
