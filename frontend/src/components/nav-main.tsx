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
  SidebarMenuAction,
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
    <>
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

    </>
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

  const [childActive, setChildActive] = React.useState(false);
  const [selfActive, setSelfActive] = React.useState(false);

  // Calculate if any child is active after hydration
  React.useEffect(() => {
    if (!isHydrated) return;

    const active = (item.items ?? []).some((s) => {
      if (s.url === "/" && (currentPath === "/" || currentPath === "/dashboard")) return true;
      return s.url !== "/" && s.url !== "#" && currentPath.startsWith(s.url);
    });

    setChildActive(active);
    setSelfActive(item.url !== "#" && currentPath === item.url);
  }, [isHydrated, currentPath, item.items]);

  // Derive open state from persisted menu state or child activity (no internal state)
  const open = React.useMemo(() => {
    if (!isHydrated) return false;
    if (hasMenuState(item.title)) {
      return isMenuExpanded(item.title);
    }
    return childActive || selfActive; // auto-expand when a child or the section page is active and no saved state exists yet
  }, [childActive, selfActive, hasMenuState, isHydrated, isMenuExpanded, item.title]);

  const isActive = isHydrated ? (childActive || selfActive) : false;

  return (
    <Collapsible
      asChild
      open={isHydrated ? open : false}
      onOpenChange={(nextOpen) => {
        if (!isHydrated) return;
        setMenuExpanded(item.title, nextOpen);
      }}
      className="group/collapsible"
      suppressHydrationWarning={true}
    >
      <SidebarMenuItem>
        {/* Row behaves as link and toggle:
            - Primary left click: expands when closed; navigates when already open
            - Modified/middle click: navigate (no toggle)
        */}
        <SidebarMenuButton tooltip={item.title} isActive={isActive} asChild>
          <a
            href={item.url}
            onClick={(e) => {
              if (!isHydrated) return;
              // Always persist expansion, then allow navigation
              setMenuExpanded(item.title, true);
            }}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
          </a>
        </SidebarMenuButton>

        {/* Caret toggle on the right (also toggles) */}
        <CollapsibleTrigger asChild>
          <SidebarMenuAction aria-label={`Toggle ${item.title} navigation`}>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuAction>
        </CollapsibleTrigger>

        <CollapsibleContent suppressHydrationWarning={true}>
          <SidebarMenuSub>
            {(item.items ?? []).map((subItem) => (
              <SubMenuItem key={subItem.title} subItem={subItem} />
            ))}
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
