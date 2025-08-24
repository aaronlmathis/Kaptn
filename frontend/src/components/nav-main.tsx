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

function NavGroupItem({ item }: { item: Item }) {
  const {
    currentPath,
    isHydrated,
    hasMenuState,
    isMenuExpanded,
    setMenuExpanded,
  } = useNavigation();

  // Always start with false to ensure SSR/client consistency
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [childActive, setChildActive] = React.useState(false);

  // Calculate if any child is active after hydration
  React.useEffect(() => {
    if (!isHydrated) return;

    const active = (item.items ?? []).some((s) => {
      if (s.url === "/" && (currentPath === "/" || currentPath === "/dashboard")) return true;
      return s.url !== "/" && s.url !== "#" && currentPath.startsWith(s.url);
    });

    setChildActive(active);
  }, [isHydrated, currentPath, item.items]);

  // Initialize open state after hydration to prevent SSR mismatch
  React.useEffect(() => {
    if (!isHydrated) return;

    if (hasMenuState(item.title)) {
      // Use saved preference
      setInternalOpen(isMenuExpanded(item.title));
    } else if (childActive) {
      // Auto-expand when a child is active (only if no saved state)
      setMenuExpanded(item.title, true);
      setInternalOpen(true);
    }
  }, [isHydrated, childActive, hasMenuState, isMenuExpanded, item.title, setMenuExpanded]);

  const open = internalOpen;

  return (
    <Collapsible
      asChild
      open={isHydrated ? open : false} // Always false during SSR
      onOpenChange={(nextOpen) => {
        if (!isHydrated) return; // Prevent state changes during SSR
        setInternalOpen(nextOpen);
        setMenuExpanded(item.title, nextOpen);
      }}
      className="group/collapsible"
      suppressHydrationWarning={true} // Suppress hydration warnings for this component
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={isHydrated ? childActive : false}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent suppressHydrationWarning={true}>
          <SidebarMenuSub>
            {(item.items ?? []).map((subItem) => {
              return (
                <SubMenuItem key={subItem.title} subItem={subItem} />
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SubMenuItem({ subItem }: { subItem: { title: string; url: string; isActive?: boolean } }) {
  const { currentPath, isHydrated } = useNavigation();
  const [isActive, setIsActive] = React.useState(false);

  // Calculate active state after hydration
  React.useEffect(() => {
    if (!isHydrated) return;

    const active = (subItem.url === "/" && (currentPath === "/" || currentPath === "/dashboard")) ||
      (subItem.url !== "/" && subItem.url !== "#" && currentPath.startsWith(subItem.url));

    setIsActive(active);
  }, [isHydrated, currentPath, subItem.url]);

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={isHydrated ? isActive : false}>
        <a href={subItem.url}>
          <span>{subItem.title}</span>
        </a>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
