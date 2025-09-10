/* src/components/nav-observability.tsx */
"use client";

import * as React from "react";
import { useNavigation } from "@/contexts/navigation-context";
import type { ComponentType } from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type ObservabilityItem = {
  title: string;
  url: string;
  icon?: ComponentType<Record<string, unknown>>;
  isActive?: boolean;
};

export function NavObservability({ items }: { items: ObservabilityItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Observability</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <ObservabilityMenuItem key={item.title} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ObservabilityMenuItem({ item }: { item: ObservabilityItem }) {
  const { currentPath, isHydrated } = useNavigation();

  // Always start with inactive state to prevent hydration mismatches
  const [isActive, setIsActive] = React.useState(false);

  // Calculate active state after hydration
  React.useEffect(() => {
    if (!isHydrated) return;

    const active = (item.url === "/" && (currentPath === "/" || currentPath === "/dashboard")) ||
      (item.url !== "/" && item.url !== "#" && currentPath.startsWith(item.url));

    setIsActive(active);
  }, [isHydrated, currentPath, item.url]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={item.title} isActive={isHydrated ? isActive : false} asChild>
        <a href={item.url}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
