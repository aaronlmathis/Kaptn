/* src/components/nav-main.tsx */
"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { useNavigation } from "@/contexts/navigation-context";
import type { ComponentType } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

type Item = {
  title: string;
  url: string;
  icon?: ComponentType<Record<string, unknown>>;
  isActive?: boolean;
  items?: { title: string; url: string; isActive?: boolean }[];
};

export function NavMain({ items }: { items: Item[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.items && item.items.length > 0 ? (
            <NavGroupItem key={item.title} item={item} />
          ) : (
            <LeafItem key={item.title} item={item} />
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function LeafItem({ item }: { item: Item }) {
  const { currentPath, isHydrated } = useNavigation();
  const isActive =
    isHydrated &&
    ((item.url === "/" && (currentPath === "/" || currentPath === "/dashboard")) ||
      (item.url !== "/" && item.url !== "#" && currentPath.startsWith(item.url)));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={item.title} isActive={!!isActive} asChild>
        <a href={item.url}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavGroupItem({ item }: { item: Item }) {
  const {
    currentPath,
    isHydrated,
    hasMenuState,
    isMenuExpanded,
    setMenuExpanded,
  } = useNavigation();

  // PRE-HYDRATION: do NOT infer open from route (prevents first-paint flip)
  // Initial open = saved preference (if any), else closed.
  const stored = hasMenuState(item.title) ? isMenuExpanded(item.title) : false;

  // After hydration, if no saved preference, auto-open when a child is active.
  const childActive =
    isHydrated &&
    (item.items ?? []).some((s) => {
      if (s.url === "/" && (currentPath === "/" || currentPath === "/dashboard")) return true;
      return s.url !== "/" && s.url !== "#" && currentPath.startsWith(s.url);
    });

  React.useEffect(() => {
    if (!isHydrated) return;
    if (!hasMenuState(item.title) && childActive) {
      setMenuExpanded(item.title, true);
    }
  }, [isHydrated, childActive, hasMenuState, item.title, setMenuExpanded]);

  const open = stored;

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={(nextOpen) => setMenuExpanded(item.title, nextOpen)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={childActive}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {(item.items ?? []).map((subItem) => {
              const subIsActive =
                isHydrated &&
                ((subItem.url === "/" &&
                  (currentPath === "/" || currentPath === "/dashboard")) ||
                  (subItem.url !== "/" &&
                    subItem.url !== "#" &&
                    currentPath.startsWith(subItem.url)));
              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton asChild isActive={!!subIsActive}>
                    <a href={subItem.url}>
                      <span>{subItem.title}</span>
                    </a>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
