## Fix Header / Page Title
You are a frontend developer intern that has been tasked with a simple, but tedious task to fix the Kaptn frontend.

## Goal
To remove the page title and subtitle from the <resource>PageContainer.tsx page / main content area, and move it to the breadcrum area in #site-header.tsx

## Tasks
You are to look at every resource page container ( `<resource>PageContainer.tsx` ) found in `frontend/src/components/containers` and standardize the format / look by performing a series of tasks based on what content is on the page. Not all pages have items that need removed or added, but you are to look on every page.

## Task 1
You are to look for the section in the page that has the page title (Resource Name e.g. Pods, Services, Resource Quotas etc) and the subtitle - as well as the LiveStatusBadge, and remove all of it. Do not remove the py-6 div that wraps it and the summary cards.

Example:
```
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
```

## Task 2
Look for the text 'Last Updated:' followed by a time. Remove this visual element as well as well as any use of lastUpdated as a prop for SummaryCards. SummaryCards no longer accepts lastUpdated as a prop.

Example:
```
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							<span suppressHydrationWarning>Last updated: {new Date(lastUpdated).toLocaleTimeString()}</span>
						</div>
					)}
```					

## Task 3
Look for any other variation of live indicator that may be on the page and remove it as well:

Example:
- Real-time updates enabled

## Task 4
Add new LiveDataStatusBadge in the page header, matching this format below. All PageContainer's have the same header format, so this should be easy to do. Every page *should* have the isConnected variable. If it doesn't, look at PodsPageContainer.tsx and match how that page gets isConnected.

Example:
```
import { LiveDataStatusBadge } from "@/components/badges/LiveDataStatus";

// Other code

			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Pods</h1>
						</div>
						<p className="text-muted-foreground">
							Manage and monitor pod resources in your Kubernetes cluster
						</p>
					</div>
					<LiveDataStatusBadge isConnected={isConnected} />
				</div>
			</div>
```			

## Target Files
You are to perform all 4 tasks on the files below. After completing all tasks on a file, you are to modify this prompt, marking the file as done.

`frontend/src/components/containers/StatefulSetsPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/ResourceQuotasPageContainer.tsx` ✅ DONE - Updated with LiveDataStatusBadge and styled filter dropdowns with badges
`frontend/src/components/containers/CSIDriversPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/IngressesPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/NetworkPoliciesPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/ReplicaSetsPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/VirtualServicesPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/LogsPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/NodesPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/EventsPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/ApiResourcesPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/ServicesPageContainer.tsx` ✅ DONE
`frontend/src/components/containers/EndpointsPageContainer.tsx`
`frontend/src/components/containers/PodsPageContainer.tsx`
`frontend/src/components/containers/PersistentVolumesPageContainer.tsx`
`frontend/src/components/containers/RbacPageContainer.tsx`
`frontend/src/components/containers/EndpointSlicesPageContainer.tsx`
`frontend/src/components/containers/ClusterRolesPageContainer.tsx`
`frontend/src/components/containers/DeploymentsPageContainer.tsx`
`frontend/src/components/containers/VolumeSnapshotsPageContainer.tsx`
`frontend/src/components/containers/StorageClassesPageContainer.tsx`
`frontend/src/components/containers/CronJobsPageContainer.tsx`
`frontend/src/components/containers/RolesPageContainer.tsx`
`frontend/src/components/containers/ConfigMapsPageContainer.tsx`
`frontend/src/components/containers/VolumeSnapshotClassesPageContainer.tsx`
`frontend/src/components/containers/JobsPageContainer.tsx`
`frontend/src/components/containers/HPAsPageContainer.tsx`
`frontend/src/components/containers/GatewaysPageContainer.tsx`
`frontend/src/components/containers/IngressClassesPageContainer.tsx`
`frontend/src/components/containers/LoadBalancersPageContainer.tsx`
`frontend/src/components/containers/SecretsPageContainer.tsx`
`frontend/src/components/containers/CRDsPageContainer.tsx`
`frontend/src/components/containers/NamespacesPageContainer.tsx`
`frontend/src/components/containers/DaemonSetsPageContainer.tsx`
`frontend/src/components/containers/ReplicaSetsPageContainer.tsx`
`frontend/src/components/containers/VirtualServicesPageContainer.tsx`
`frontend/src/components/containers/LogsPageContainer.tsx`
`frontend/src/components/containers/NodesPageContainer.tsx`
`frontend/src/components/containers/EventsPageContainer.tsx`
`frontend/src/components/containers/ApiResourcesPageContainer.tsx`
`frontend/src/components/containers/ServicesPageContainer.tsx`
`frontend/src/components/containers/EndpointsPageContainer.tsx`
`frontend/src/components/containers/PodsPageContainer.tsx`
`frontend/src/components/containers/PersistentVolumesPageContainer.tsx`
`frontend/src/components/containers/RbacPageContainer.tsx`
`frontend/src/components/containers/EndpointSlicesPageContainer.tsx`
`frontend/src/components/containers/ClusterRolesPageContainer.tsx`
`frontend/src/components/containers/DeploymentsPageContainer.tsx`
`frontend/src/components/containers/VolumeSnapshotsPageContainer.tsx`
`frontend/src/components/containers/StorageClassesPageContainer.tsx`
`frontend/src/components/containers/CronJobsPageContainer.tsx`
`frontend/src/components/containers/RolesPageContainer.tsx`
`frontend/src/components/containers/ConfigMapsPageContainer.tsx`
`frontend/src/components/containers/VolumeSnapshotClassesPageContainer.tsx`
`frontend/src/components/containers/JobsPageContainer.tsx`
`frontend/src/components/containers/HPAsPageContainer.tsx`
`frontend/src/components/containers/GatewaysPageContainer.tsx`
`frontend/src/components/containers/IngressClassesPageContainer.tsx`
`frontend/src/components/containers/LoadBalancersPageContainer.tsx`
`frontend/src/components/containers/SecretsPageContainer.tsx`
`frontend/src/components/containers/CRDsPageContainer.tsx`
`frontend/src/components/containers/NamespacesPageContainer.tsx`
`frontend/src/components/containers/DaemonSetsPageContainer.tsx`