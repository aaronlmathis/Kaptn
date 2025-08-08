"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { useNavigation } from "@/contexts/navigation-context"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ComponentType<Record<string, unknown>>
    items?: {
      title: string
      url: string
    }[]
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { setMenuExpanded, isMenuExpanded, hasMenuState, isHydrated, currentPath } = useNavigation()

  const handleMenuToggle = (menuTitle: string) => {
    const currentState = isMenuExpanded(menuTitle)
    setMenuExpanded(menuTitle, !currentState)
  }

  // Function to check if a path is active
  const isPathActive = (url: string): boolean => {
    if (!isHydrated) return false

    // For non-hash URLs, check if current path starts with the url
    if (url !== '#') {
      return currentPath.startsWith(url)
    }

    return false
  }

  // Function to check if a parent item should be active (has an active child)
  const hasActiveChild = (items?: { title: string; url: string }[]): boolean => {
    if (!items || !isHydrated) return false
    return items.some(subItem => isPathActive(subItem.url))
  }

  // Function to determine if menu should be expanded
  const getMenuState = (menuTitle: string, hasActiveChildren: boolean): boolean => {
    // If not hydrated yet, show expanded state based on active children for SSR consistency  
    if (!isHydrated) {
      return hasActiveChildren
    }

    // Use the stored state from localStorage (via context)
    // If user has explicitly set this menu's state, use that
    // Otherwise, default to expanded if has active children
    if (hasMenuState(menuTitle)) {
      return isMenuExpanded(menuTitle)
    }

    return hasActiveChildren
  }

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            // If item has no subitems and a real URL, render as a simple navigation link
            if (!item.items || item.items.length === 0) {
              const isActive = isPathActive(item.url)
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton tooltip={item.title} isActive={isActive} asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }

            // If item has subitems, render as collapsible
            const parentIsActive = hasActiveChild(item.items)
            const isExpanded = getMenuState(item.title, parentIsActive)

            return (
              <Collapsible
                key={item.title}
                asChild
                open={isExpanded}
                onOpenChange={() => handleMenuToggle(item.title)}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title} isActive={parentIsActive}>
                      <item.icon />
                      <span>{item.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => {
                        const subIsActive = isPathActive(subItem.url)
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={subIsActive}>
                              <a href={subItem.url}>
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
