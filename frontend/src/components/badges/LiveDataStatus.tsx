import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface LiveDataStatusProps {
	isConnected: boolean;
	className?: string;
}

/**
 * LiveDataStatusBadge Component
 * 
 * Renders just the badge showing websocket connection status.
 * Can be used inline within other components.
 */
export function LiveDataStatusBadge({ isConnected, className }: LiveDataStatusProps) {
	return (
		<Badge
			variant={isConnected ? "default" : "secondary"}
			className={cn(
				"flex items-center gap-2 px-3 py-1",
				isConnected
					? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800"
					: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700",
				className
			)}
		>
			{isConnected ? (
				<>
					<Wifi className="h-3 w-3" />
					Live
				</>
			) : (
				<>
					<WifiOff className="h-3 w-3" />
					Offline
				</>
			)}
		</Badge>
	);
}

/**
 * LiveDataStatus Component
 * 
 * Displays a floating badge in the bottom-right corner showing the current
 * websocket connection status for real-time data updates.
 */
export function LiveDataStatus({ isConnected }: { isConnected: boolean }) {
	return (
		<div className="fixed bottom-4 right-4 z-50">
			<LiveDataStatusBadge isConnected={isConnected} />
		</div>
	);
}