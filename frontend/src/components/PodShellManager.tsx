import React from 'react'
import { useShell } from '@/hooks/use-shell'
import { TerminalSession } from '@/components/TerminalSession'
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from '@/components/ui/drawer'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
	IconX,
	IconTerminal,
	IconPlus,
	IconCircle,
	IconLoader,
	IconAlertTriangle,
	IconCircleCheckFilled
} from '@tabler/icons-react'

export function PodShellManager() {
	const {
		tabs,
		activeTabId,
		isDrawerOpen,
		setDrawerOpen,
		closeShell,
		closeAllShells,
		setActiveTab
	} = useShell()

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'connecting':
				return <IconLoader className="size-3 animate-spin text-yellow-500" />
			case 'connected':
				return <IconCircleCheckFilled className="size-3 text-green-500" />
			case 'error':
				return <IconAlertTriangle className="size-3 text-red-500" />
			case 'closed':
				return <IconCircle className="size-3 text-gray-500" />
			default:
				return <IconCircle className="size-3 text-gray-500" />
		}
	}

	const getTabLabel = (tab: typeof tabs[0]) => {
		const baseLabel = `${tab.podName}/${tab.containerName}`
		return baseLabel.length > 20 ? `${baseLabel.substring(0, 17)}...` : baseLabel
	}

	if (tabs.length === 0) {
		return null
	}

	return (
		<Drawer
			direction="bottom"
			open={isDrawerOpen}
			onOpenChange={setDrawerOpen}
		>
			<DrawerContent className="h-[85vh] max-h-[85vh]">
				<DrawerHeader className="flex-shrink-0 pb-2">
					<div className="flex items-center justify-between">
						<DrawerTitle className="flex items-center gap-2">
							<IconTerminal className="size-5" />
							Shell Sessions
						</DrawerTitle>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={closeAllShells}
								className="text-xs"
							>
								Close All
							</Button>
						</div>
					</div>
				</DrawerHeader>

				{/* Tabs Navigation */}
				<div className="flex-shrink-0 px-6 pb-2">
					<Tabs value={activeTabId || ''} onValueChange={setActiveTab}>
						<div className="flex items-center justify-between">
							<ScrollArea className="w-full">
								<TabsList className="w-max h-10 p-1">
									{tabs.map((tab) => (
										<TabsTrigger
											key={tab.id}
											value={tab.id}
											className="relative flex items-center gap-2 px-3 py-1.5"
										>
											{getStatusIcon(tab.status)}
											<span className="text-xs font-medium">
												{getTabLabel(tab)}
											</span>
											<Button
												variant="ghost"
												size="sm"
												className="h-4 w-4 p-0 hover:bg-red-100 hover:text-red-600"
												onClick={(e) => {
													e.stopPropagation()
													closeShell(tab.id)
												}}
											>
												<IconX className="size-3" />
											</Button>
										</TabsTrigger>
									))}
								</TabsList>
								<ScrollBar orientation="horizontal" />
							</ScrollArea>

							{/* New Shell Button - Future Enhancement */}
							<Button
								variant="outline"
								size="sm"
								className="ml-2 flex-shrink-0"
								disabled
								title="Coming soon: Select a pod to create new shell"
							>
								<IconPlus className="size-4" />
							</Button>
						</div>

						{/* Tabs Content */}
						<div className="mt-4 flex-1 min-h-0">
							{tabs.map((tab) => (
								<TabsContent
									key={tab.id}
									value={tab.id}
									className="h-[calc(85vh-140px)] mt-0 border rounded-lg overflow-hidden"
								>
									<TerminalSession
										pod={tab.podName}
										container={tab.containerName}
										namespace={tab.namespace}
										tabId={tab.id}
									/>
								</TabsContent>
							))}
						</div>
					</Tabs>
				</div>
			</DrawerContent>
		</Drawer>
	)
}
