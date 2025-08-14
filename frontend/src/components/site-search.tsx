"use client"

import * as React from "react"
import {
	IconSearch,
	IconCube,
	IconStack,
	IconNetwork,
	IconFile,
	IconLock,
	IconServer,
	IconFolder,
	IconUsers,
	IconShield,
	IconSettings,
	IconDatabase,
	IconCopy,
	IconGitBranch,
	IconCloudComputing,
	IconDeviceDesktop,
	IconX
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command"

import { useDebouncedSearch } from "@/hooks/useSearch"
import { generateResourceUrl, getResourceTypeDisplayName, type SearchResult } from "@/lib/k8s-search"


// Resource type icons mapping - more specific and compact
const resourceIcons = {
	pods: IconCube,
	deployments: IconStack,
	services: IconNetwork,
	configmaps: IconFile,
	secrets: IconLock,
	nodes: IconServer,
	namespaces: IconFolder,
	serviceaccounts: IconUsers,
	'service-accounts': IconUsers,
	roles: IconShield,
	clusterroles: IconShield,
	rolebindings: IconUsers,
	clusterrolebindings: IconUsers,
	statefulsets: IconDatabase,
	daemonsets: IconCopy,
	replicasets: IconGitBranch,
	jobs: IconSettings,
	cronjobs: IconSettings,
	'persistent-volumes': IconDatabase,
	'persistent-volume-claims': IconDatabase,
	'storage-classes': IconDatabase,
	ingresses: IconCloudComputing,
	'network-policies': IconNetwork,
	endpoints: IconDeviceDesktop,
	'resource-quotas': IconSettings,
}

function SearchResults({ results, loading, error, onSelect }: {
	results: Record<string, SearchResult[]>
	loading: boolean
	error: string | null
	onSelect: (result: SearchResult) => void
}) {
	const getResourceIcon = (type: string) => {
		const IconComponent = resourceIcons[type as keyof typeof resourceIcons] || IconCube
		return IconComponent
	}

	if (loading) {
		return (
			<div className="p-4 text-center text-sm text-muted-foreground">
				Searching...
			</div>
		)
	}

	if (error) {
		return (
			<div className="p-4 text-center text-sm text-destructive">
				Error: {error}
			</div>
		)
	}

	const hasResults = Object.keys(results).length > 0

	if (!hasResults) {
		return (
			<div className="p-4 text-center text-sm text-muted-foreground">
				No resources found.
			</div>
		)
	}

	return (
		<div className="max-h-96 overflow-y-auto">
			{Object.entries(results).map(([resourceType, items]) => {
				const IconComponent = getResourceIcon(resourceType)
				const displayName = getResourceTypeDisplayName(resourceType)

				return (
					<div key={resourceType} className="border-b border-border last:border-0">
						<div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
							{displayName}
						</div>
						{items.map((item) => (
							<button
								key={item.id}
								onClick={() => onSelect(item)}
								className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
							>
								<IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between">
										<span className="font-medium truncate">{item.name}</span>
										{item.age && (
											<span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
												{item.age}
											</span>
										)}
									</div>
									{item.namespace && (
										<div className="text-xs text-muted-foreground truncate">
											{item.namespace}
										</div>
									)}
								</div>
							</button>
						))}
					</div>
				)
			})}
		</div>
	)
}

export function SiteSearch() {
	const [open, setOpen] = React.useState(false)
	const [dropdownOpen, setDropdownOpen] = React.useState(false)
	const [query, setQuery] = React.useState("")
	const [isMobile, setIsMobile] = React.useState(false)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const dropdownRef = React.useRef<HTMLDivElement>(null)

	// Use the debounced search hook
	const { results, loading, error } = useDebouncedSearch(query, {
		useMockData: false,
		debounceMs: 300
	})

	// Check if mobile
	React.useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth < 768)
		}
		checkMobile()
		window.addEventListener('resize', checkMobile)
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	// Handle keyboard shortcuts
	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !e.metaKey && !e.ctrlKey)) {
				e.preventDefault()
				if (isMobile) {
					setOpen(true)
				} else {
					inputRef.current?.focus()
					setDropdownOpen(true)
				}
			}
			if (e.key === "Escape") {
				setDropdownOpen(false)
			}
		}

		document.addEventListener("keydown", down)
		return () => document.removeEventListener("keydown", down)
	}, [isMobile])

	// Handle click outside to close dropdown
	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setDropdownOpen(false)
			}
		}

		if (dropdownOpen) {
			document.addEventListener("mousedown", handleClickOutside)
			return () => document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [dropdownOpen])

	const handleSelect = (result: SearchResult) => {
		setOpen(false)
		setDropdownOpen(false)
		setQuery("")
		const url = generateResourceUrl(result)
		window.location.href = url
	}

	const handleInputChange = (value: string) => {
		setQuery(value)
		if (!dropdownOpen && value && !isMobile) {
			setDropdownOpen(true)
		}
	}

	const clearSearch = () => {
		setQuery("")
		setDropdownOpen(false)
	}

	// Mobile: Use CommandDialog
	if (isMobile) {
		return (
			<>
				<Button
					variant="outline"
					className="relative h-9 w-9 p-0"
					onClick={() => setOpen(true)}
				>
					<IconSearch className="h-4 w-4" />
				</Button>

				<CommandDialog
					open={open}
					onOpenChange={setOpen}
					title="Search Resources"
					description="Search for Kubernetes resources across your cluster"
				>
					<CommandInput
						placeholder="Search pods, services, deployments..."
						value={query}
						onValueChange={setQuery}
					/>
					<ScrollArea className="max-h-[400px]">
						<CommandList>
							<CommandEmpty>
								{loading ? "Searching..." : error ? `Error: ${error}` : "No resources found."}
							</CommandEmpty>

							{Object.entries(results).map(([resourceType, items]) => {
								const IconComponent = resourceIcons[resourceType as keyof typeof resourceIcons] || IconCube
								const displayName = getResourceTypeDisplayName(resourceType)

								return (
									<CommandGroup key={resourceType} heading={displayName}>
										{items.map((item) => (
											<CommandItem
												key={item.id}
												value={`${item.name} ${item.namespace || ""} ${resourceType}`}
												onSelect={() => handleSelect(item)}
												className="flex items-center gap-3 py-2"
											>
												<IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
												<div className="flex-1 min-w-0">
													<div className="flex items-center justify-between">
														<span className="font-medium truncate">{item.name}</span>
														{item.age && (
															<span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
																{item.age}
															</span>
														)}
													</div>
													{item.namespace && (
														<div className="text-xs text-muted-foreground truncate">
															{item.namespace}
														</div>
													)}
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								)
							})}
						</CommandList>
					</ScrollArea>
				</CommandDialog>
			</>
		)
	}

	// Desktop: Use Dropdown with proper input handling
	return (
		<div ref={dropdownRef} className="relative">
			<div className="relative">
				<IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder="Search resources..."
					value={query}
					onChange={(e) => handleInputChange(e.target.value)}
					className="h-9 w-64 pl-9 pr-16"
					onFocus={() => setDropdownOpen(true)}
				/>
				<div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
					{query && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0"
							onClick={clearSearch}
						>
							<IconX className="h-3 w-3" />
						</Button>
					)}
					<kbd className="hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 xl:flex">
						<span className="text-xs">⌘</span>K
					</kbd>
				</div>
			</div>

			{dropdownOpen && (query || loading) && (
				<div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-md border bg-popover p-0 text-popover-foreground shadow-lg">
					<SearchResults
						results={results}
						loading={loading}
						error={error}
						onSelect={handleSelect}
					/>
				</div>
			)}
		</div>
	)
}
