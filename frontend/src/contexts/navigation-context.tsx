/* src/contexts/navigation-context.tsx */
"use client";

import {
	createContext,
	useContext,
	useMemo,
	useState,
	useLayoutEffect,
	useEffect,
	type ReactNode,
} from "react";

export interface BreadcrumbItem {
	title: string;
	url?: string;
}

export interface NavigationContextValue {
	currentPath: string;
	breadcrumbs: BreadcrumbItem[];
	// per-parent menu open/closed state
	isMenuExpanded: (menuTitle: string) => boolean;
	hasMenuState: (menuTitle: string) => boolean;
	setMenuExpanded: (menuTitle: string, expanded: boolean) => void;
	clearMenuState: () => void;
	isHydrated: boolean;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
	// Current path available immediately on client
	const [currentPath, setCurrentPath] = useState<string>(() => {
		if (typeof window === "undefined") return "/";
		return window.location.pathname || "/";
	});

	// Restore per-menu state from storage (no route inference yet)
	const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => {
		try {
			const raw = typeof localStorage !== "undefined" ? localStorage.getItem("kaptn.sidebar.menus") : null;
			if (raw) return JSON.parse(raw);
		} catch { }
		return {};
	});

	const [isHydrated, setIsHydrated] = useState(false);

	// Simple breadcrumbs (trim as you like)
	const breadcrumbsMap: Record<string, BreadcrumbItem[]> = useMemo(
		() => ({
			"/": [{ title: "Kubernetes Admin", url: "/" }, { title: "Dashboard" }],
			"/dashboard": [{ title: "Kubernetes Admin", url: "/" }, { title: "Dashboard" }],
			// … keep your mapping here …
		}),
		[]
	);

	const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
		return breadcrumbsMap[currentPath] || [{ title: "Kubernetes Admin", url: "/" }];
	}, [breadcrumbsMap, currentPath]);

	const persistMenus = (next: Record<string, boolean>) => {
		setExpandedMenus(next);
		try {
			localStorage.setItem("kaptn.sidebar.menus", JSON.stringify(next));
		} catch { }
	};

	const setMenuExpanded = (menuTitle: string, expanded: boolean) => {
		persistMenus({ ...expandedMenus, [menuTitle]: expanded });
	};

	const isMenuExpanded = (menuTitle: string) => !!expandedMenus[menuTitle];
	const hasMenuState = (menuTitle: string) =>
		Object.prototype.hasOwnProperty.call(expandedMenus, menuTitle);

	// Allow transitions *after* a frame so layout is fully stable
	useLayoutEffect(() => {
		requestAnimationFrame(() => {
			document.documentElement.classList.remove("no-transitions");
			setIsHydrated(true);
		});
	}, []);

	// Track path changes (so active route highlighting works)
	useEffect(() => {
		const update = () => setCurrentPath(window.location.pathname || "/");

		const origPush = window.history.pushState;
		const origReplace = window.history.replaceState;

		window.history.pushState = function (...args) {
			// @ts-expect-error
			origPush.apply(this, args);
			update();
		};
		window.history.replaceState = function (...args) {
			// @ts-expect-error
			origReplace.apply(this, args);
			update();
		};

		const onPop = () => update();
		window.addEventListener("popstate", onPop);

		return () => {
			window.removeEventListener("popstate", onPop);
			window.history.pushState = origPush;
			window.history.replaceState = origReplace;
		};
	}, []);

	const value: NavigationContextValue = {
		currentPath,
		breadcrumbs,
		isMenuExpanded,
		hasMenuState,
		setMenuExpanded,
		clearMenuState: () => persistMenus({}),
		isHydrated,
	};

	return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
	const ctx = useContext(NavigationContext);
	if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
	return ctx;
}
