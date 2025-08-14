# Resource Cache Package

This package provides an in-memory caching system for Kubernetes resources to support fast search functionality in the Kaptn dashboard.

## Overview

The cache system consists of two main components:
- **ResourceCache**: Manages the in-memory cache of Kubernetes resources
- **SearchService**: Provides search functionality over the cached resources

## Features

- **Automatic Refresh**: Periodically refreshes cached data from Kubernetes API
- **Configurable TTL**: Customizable refresh intervals and cache size
- **Fast Search**: Full-text search across resource names, namespaces, labels, and annotations
- **Resource Type Filtering**: Filter search results by specific resource types
- **Namespace Filtering**: Limit search to specific namespaces
- **Background Processing**: Non-blocking cache updates
- **Graceful Startup/Shutdown**: Proper lifecycle management

## Configuration

Cache behavior can be configured through environment variables:

```bash
# Cache refresh interval (default: 30s)
KAD_SEARCH_REFRESH_TTL=30s

# Maximum number of resources to cache (default: 10000)
KAD_SEARCH_MAX_SIZE=10000
```

## Supported Resource Types

The cache currently supports the following Kubernetes resource types:
- Pods
- Deployments
- Services
- ConfigMaps
- Secrets
- Nodes
- Namespaces
- StatefulSets
- DaemonSets
- ReplicaSets
- Jobs
- CronJobs
- Service Accounts

## API Endpoints

### Search Resources
```
GET /api/v1/search?q=<query>&types=<types>&namespace=<namespace>&limit=<limit>
```

Parameters:
- `q`: Search query (required)
- `types`: Comma-separated list of resource types to filter by (optional)
- `namespace`: Namespace to search within (optional)  
- `limit`: Maximum number of results to return (optional, default: 100)

Example:
```
GET /api/v1/search?q=nginx&types=pods,deployments&namespace=default&limit=50
```

### Cache Statistics
```
GET /api/v1/search/stats
```

Returns cache statistics including:
- Total number of cached resources
- Last refresh time
- Refresh interval
- Resource count by type

### Force Cache Refresh
```
POST /api/v1/search/refresh
```

Forces an immediate cache refresh from the Kubernetes API.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Handler    │    │  Search Service │
│  (site-search)  │───▶│ handleSearch()   │───▶│   Search()      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ Resource Cache  │
                                               │                 │
                                               │ ┌─────────────┐ │
                                               │ │    Pods     │ │
                                               │ ├─────────────┤ │
                                               │ │ Deployments │ │
                                               │ ├─────────────┤ │
                                               │ │  Services   │ │
                                               │ │     ...     │ │
                                               │ └─────────────┘ │
                                               └─────────────────┘
                                                         ▲
                                                         │
                                               ┌─────────────────┐
                                               │ Kubernetes API  │
                                               │   (periodic     │
                                               │   refresh)      │
                                               └─────────────────┘
```

## Performance Considerations

- **Memory Usage**: The cache stores resource metadata in memory. Monitor memory usage with large clusters.
- **Refresh Frequency**: Lower refresh intervals provide fresher data but increase API load.
- **Search Performance**: Full-text search is performed in-memory for sub-second response times.
- **Startup Time**: Initial cache population may take several seconds depending on cluster size.

## Monitoring

Monitor cache performance through:
- Cache statistics endpoint (`/api/v1/search/stats`)
- Application logs (cache refresh timing and resource counts)
- Memory usage metrics

## Future Enhancements

Potential improvements:
- Add more resource types (RBAC, storage, networking resources)
- Implement cache persistence for faster startup
- Add webhook-based cache updates for real-time sync
- Implement search ranking/scoring
- Add full-text search on resource specifications
- Support for custom resources (CRDs)
