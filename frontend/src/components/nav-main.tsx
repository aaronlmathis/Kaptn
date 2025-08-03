"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import { useNavigation } from "@/contexts/navigation-context"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: React.ComponentType<any>
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const { setCurrentPath, setMenuExpanded, isMenuExpanded } = useNavigation()

  const handleNavigation = (url: string) => {
    setCurrentPath(url)
  }

  const handleMenuToggle = (menuTitle: string, currentState: boolean) => {
    setMenuExpanded(menuTitle, !currentState)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isExpanded = isMenuExpanded(item.title)

          return (
            <Collapsible
              key={item.title}
              asChild
              open={isExpanded}
              onOpenChange={(open) => handleMenuToggle(item.title, isExpanded)}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    onClick={() => item.url !== '#' && handleNavigation(item.url)}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild>
                          <a
                            href={subItem.url}
                            onClick={(e) => {
                              e.preventDefault()
                              handleNavigation(subItem.url)
                            }}
                          >
                            <span>{subItem.title}</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
