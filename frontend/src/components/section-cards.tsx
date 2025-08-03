import { useEffect } from "react"
import { IconTrendingDown, IconTrendingUp, IconAlertTriangle, IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { useOverview } from "@/hooks/use-k8s-data"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function getStatusBadge(value: number, total: number, type: 'pods' | 'nodes') {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  if (type === 'pods') {
    if (percentage >= 85) {
      return (
        <Badge variant="outline" className="text-green-600 border-border bg-transparent">
          <IconCheck className="size-3" />
          Healthy
        </Badge>
      );
    } else if (percentage >= 70) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-border bg-transparent">
          <IconAlertTriangle className="size-3" />
          Warning
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="text-red-600 border-border bg-transparent">
          <IconAlertTriangle className="size-3" />
          Critical
        </Badge>
      );
    }
  } else { // nodes
    if (value === total) {
      return (
        <Badge variant="outline" className="text-green-600 border-border bg-transparent">
          <IconCheck className="size-3" />
          Ready
        </Badge>
      );
    } else if (percentage >= 80) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-border bg-transparent">
          <IconAlertTriangle className="size-3" />
          Warning
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="text-red-600 border-border bg-transparent">
          <IconAlertTriangle className="size-3" />
          Critical
        </Badge>
      );
    }
  }
}

function getUsageBadge(percentage: number, trend: number = 0) {
  const TrendIcon = trend > 0 ? IconTrendingUp : trend < 0 ? IconTrendingDown : IconCheck;
  const trendText = trend > 0 ? `+${Math.abs(trend)}%` : trend < 0 ? `-${Math.abs(trend)}%` : "Stable";

  if (percentage > 90) {
    return (
      <Badge variant="outline" className="text-red-600 border-border bg-transparent">
        <TrendIcon className="size-3" />
        {trendText}
      </Badge>
    );
  } else if (percentage > 75) {
    return (
      <Badge variant="outline" className="text-yellow-600 border-border bg-transparent">
        <TrendIcon className="size-3" />
        {trendText}
      </Badge>
    );
  } else {
    return (
      <Badge variant="outline" className="text-green-600 border-border bg-transparent">
        <TrendIcon className="size-3" />
        {trendText}
      </Badge>
    );
  }
}

export function SectionCards() {
  const { data: overviewData, loading, error } = useOverview();
  const overview = overviewData?.[0];

  // Show toast notifications for critical advisories
  useEffect(() => {
    if (overview?.advisories) {
      overview.advisories.forEach(advisory => {
        if (advisory.includes('critical')) {
          toast.error(advisory, {
            duration: 5000,
            action: {
              label: 'Dismiss',
              onClick: () => { },
            },
          });
        } else if (advisory.includes('warning') || advisory.includes('pressure') || advisory.includes('unavailable')) {
          toast.warning(advisory, {
            duration: 4000,
          });
        }
      });
    }
  }, [overview?.advisories]);

  if (loading) {
    return (
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <CardDescription>
                <Skeleton className="h-4 w-20" />
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                <Skeleton className="h-8 w-16" />
              </CardTitle>
              <CardAction>
                <Skeleton className="h-6 w-16" />
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium w-full">
                <Skeleton className="h-4 flex-1" />
              </div>
              <div className="text-muted-foreground w-full">
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-center">
            <IconAlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="ml-2 text-sm font-medium text-red-800 dark:text-red-200">
              Failed to load dashboard metrics: {error}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const podPercentage = overview.pods.total > 0 ? (overview.pods.running / overview.pods.total) * 100 : 0;
  const nodePercentage = overview.nodes.total > 0 ? (overview.nodes.ready / overview.nodes.total) * 100 : 0;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Running Pods</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {overview.pods.running}/{overview.pods.total}
          </CardTitle>
          <CardAction>
            {getStatusBadge(overview.pods.running, overview.pods.total, 'pods')}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {Math.round(podPercentage)}% pods running successfully <IconCheck className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {overview.pods.pending > 0 ? `${overview.pods.pending} pods pending startup` : 'All pods running'}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Cluster Nodes</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {overview.nodes.ready}/{overview.nodes.total}
          </CardTitle>
          <CardAction>
            {getStatusBadge(overview.nodes.ready, overview.nodes.total, 'nodes')}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {overview.nodes.ready === overview.nodes.total ? (
              <>All nodes ready <IconCheck className="size-4" /></>
            ) : (
              <>{overview.nodes.total - overview.nodes.ready} node(s) unavailable <IconAlertTriangle className="size-4 text-yellow-600" /></>
            )}
          </div>
          <div className="text-muted-foreground">
            {overview.nodes.ready === overview.nodes.total ? 'All systems operational' : 'Node maintenance may be required'}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>CPU Usage</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {Math.round(overview.cpu.usagePercent)}%
          </CardTitle>
          <CardAction>
            {getUsageBadge(overview.cpu.usagePercent)}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {overview.cpu.usagePercent > 75 ? 'High CPU load detected' : 'CPU usage within normal range'} <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {overview.cpu.usagePercent > 75 ? 'Consider scaling resources' : 'Performance is stable'}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Memory Usage</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {Math.round(overview.memory.usagePercent)}%
          </CardTitle>
          <CardAction>
            {getUsageBadge(overview.memory.usagePercent)}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {overview.memory.usagePercent > 75 ? 'Memory pressure detected' : 'Memory usage stable'} <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {overview.memory.usagePercent > 75 ? 'Consider scaling resources' : 'Memory allocation optimal'}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
