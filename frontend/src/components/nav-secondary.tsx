"use client"

import * as React from "react"
import { type Icon } from "@tabler/icons-react"
import { useNavigation } from "@/contexts/navigation-context"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: Icon
    items?: {
      title: string
      url: string
    }[]
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { setCurrentPath } = useNavigation()

  const handleNavigation = (url: string) => {
    setCurrentPath(url)
  }

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton tooltip={item.title} asChild>
                <a 
                  href={item.url}
                  onClick={(e) => {
                    e.preventDefault()
                    handleNavigation(item.url)
                  }}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
