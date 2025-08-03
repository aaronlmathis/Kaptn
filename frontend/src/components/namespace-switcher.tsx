"use client"

import * as React from "react"
import { ChevronsUpDown, Globe, Layers } from "lucide-react"
import { useNamespace } from "@/contexts/namespace-context"

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar"

export function NamespaceSwitcher() {
	const { isMobile } = useSidebar()
	const { selectedNamespace, namespaces, loading, setSelectedNamespace } = useNamespace()

	const allOption = {
		name: "All Namespaces",
		value: "all",
		icon: Globe,
		description: "View resources across all namespaces"
	}

	const namespaceOptions = namespaces.map(namespace => ({
		name: namespace.metadata.name,
		value: namespace.metadata.name,
		icon: Layers,
		description: `Resources in ${namespace.metadata.name}`
	}))

	const allOptions = [allOption, ...namespaceOptions]
	const activeOption = allOptions.find(option => option.value === selectedNamespace) || allOption

	if (loading) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						size="lg"
						className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
							<Layers className="size-4 animate-pulse" />
						</div>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">Loading...</span>
							<span className="truncate text-xs">Fetching namespaces</span>
						</div>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		)
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							tooltip="Namespace"
						>
							<div className="bg-muted dark:bg-muted-dark text-white flex aspect-square size-8 items-center justify-center rounded-lg">
								<activeOption.icon className="size-4" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{activeOption.name}</span>
								<span className="truncate text-xs">{activeOption.description}</span>
							</div>
							<ChevronsUpDown className="ml-auto" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							Namespaces
						</DropdownMenuLabel>
						{allOptions.map((option, index) => (
							<DropdownMenuItem
								key={option.value}
								onClick={() => setSelectedNamespace(option.value)}
								className="gap-2 p-2"
							>
								<div className="flex size-6 items-center justify-center rounded-md border">
									<option.icon className="size-3.5 shrink-0" />
								</div>
								<div className="flex flex-col">
									<span className="font-medium">{option.name}</span>
									{option.value !== "all" && (
										<span className="text-xs text-muted-foreground">
											{option.description}
										</span>
									)}
								</div>
								{index < 10 && (
									<DropdownMenuShortcut>⌘{index === 0 ? "A" : index}</DropdownMenuShortcut>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu >
	)
}
