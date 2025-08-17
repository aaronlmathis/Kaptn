import * as React from "react"
import {
	Card,
	CardAction,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export interface SummaryCard {
	title: string
	value: number | string
	subtitle?: string
	badge?: React.ReactNode
	footer?: string
	icon?: React.ReactNode
}

interface SummaryCardsProps {
	cards: SummaryCard[]
	columns?: number
	loading?: boolean
	error?: string | null
	lastUpdated?: string | null
	noPadding?: boolean
}

export function SummaryCards({
	cards,
	columns = 4,
	loading = false,
	error = null,
	lastUpdated = null,
	noPadding = false
}: SummaryCardsProps) {
	if (loading) {
		return (
			<div
				className={`
		        /* slot‐based card styles */
		        [data-slot=card]:bg-gradient-to-t
		        [data-slot=card]:from-primary/5
		        [data-slot=card]:to-card
		        [data-slot=card]:shadow-xs
		        dark:[data-slot=card]:bg-card

		        /* grid layout */
		        grid grid-cols-1 gap-4 ${noPadding ? '' : 'px-4 lg:px-6'}
		        @xl/main:grid-cols-2 @5xl/main:grid-cols-4
		      `}
			>
				{[...Array(columns)].map((_, i) => (
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
		)
	}

	if (error) {
		return (
			<div className={noPadding ? '' : 'px-4 lg:px-6'}>
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
					<div className="flex items-center">
						<span className="ml-2 text-sm font-medium text-red-800 dark:text-red-200">
							Failed to load summary data: {error}
						</span>
					</div>
				</div>
			</div>
		)
	}

	if (!cards || cards.length === 0) {
		return null
	}

	// Helper function to format the last updated time
	const formatLastUpdated = (timestamp: string | null) => {
		if (!timestamp) return null

		try {
			const date = new Date(timestamp)
			const now = new Date()
			const diffMs = now.getTime() - date.getTime()
			const diffMinutes = Math.floor(diffMs / 60000)

			if (diffMinutes < 1) return 'Updated just now'
			if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`

			const diffHours = Math.floor(diffMinutes / 60)
			if (diffHours < 24) return `Updated ${diffHours}h ago`

			return `Updated ${date.toLocaleDateString()}`
		} catch {
			return null
		}
	}

	return (
		<div className={noPadding ? 'mb-6' : 'px-4 lg:px-6 mb-6'}>
			{/* Last Updated Info */}
			{lastUpdated && (
				<div className="mb-4 text-sm text-muted-foreground">
					{formatLastUpdated(lastUpdated)}
				</div>
			)}

			{/* Summary Cards Grid */}
			<div
				className="
		        /* slot‐based card styles */
		        [data-slot=card]:bg-gradient-to-t
		        [data-slot=card]:from-primary/5
		        [data-slot=card]:to-card
		        [data-slot=card]:shadow-xs
		        dark:[data-slot=card]:bg-card

		        /* grid layout */
		        grid grid-cols-1 gap-4
		        @xl/main:grid-cols-2 @5xl/main:grid-cols-4
		      "
			>
				{cards.map((card, index) => (
					<Card key={index} className="@container/card">
						<CardHeader>
							<CardDescription>{card.title}</CardDescription>
							<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl flex items-center gap-2">
								{card.value}
								{card.icon}
							</CardTitle>
							{card.badge && (
								<CardAction>
									{card.badge}
								</CardAction>
							)}
						</CardHeader>
						{(card.subtitle || card.footer) && (
							<CardFooter className="flex-col items-start gap-1.5 text-sm">
								{card.subtitle && (
									<div className="line-clamp-1 flex gap-2 font-medium">
										{card.subtitle}
									</div>
								)}
								{card.footer && (
									<div className="text-muted-foreground">
										{card.footer}
									</div>
								)}
							</CardFooter>
						)}
					</Card>
				))}
			</div>
		</div>
	)
}
