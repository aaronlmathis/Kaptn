import * as React from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
	children: React.ReactNode
	defaultTheme?: Theme
	storageKey?: string
}

type ThemeProviderState = {
	theme: Theme
	setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
	theme: "system",
	setTheme: () => null,
}

const ThemeProviderContext = React.createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "k8s-dashboard-theme",
	...props
}: ThemeProviderProps) {
	// Always start with default theme for SSR consistency
	const [theme, setTheme] = React.useState<Theme>(defaultTheme)
	const [isHydrated, setIsHydrated] = React.useState(false)

	// Hydrate theme from localStorage after mount to prevent SSR mismatch
	React.useEffect(() => {
		if (typeof window !== "undefined") {
			const storedTheme = localStorage.getItem(storageKey) as Theme
			if (storedTheme) {
				setTheme(storedTheme)
			}
			setIsHydrated(true)
		}
	}, [storageKey])

	React.useEffect(() => {
		// Only apply theme changes after hydration to prevent conflicts
		if (!isHydrated) return

		const root = window.document.documentElement

		// Don't remove classes if they're already correct to prevent flash
		const currentHasLight = root.classList.contains("light")
		const currentHasDark = root.classList.contains("dark")

		let targetTheme: string
		if (theme === "system") {
			targetTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
		} else {
			targetTheme = theme
		}

		// Only update classes if they need to change
		if (
			(targetTheme === "dark" && !currentHasDark) ||
			(targetTheme === "light" && !currentHasLight)
		) {
			root.classList.remove("light", "dark")
			root.classList.add(targetTheme)
		}

		// Listen for system theme changes when using system theme
		if (theme === "system") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
			const handleChange = () => {
				root.classList.remove("light", "dark")
				root.classList.add(mediaQuery.matches ? "dark" : "light")
			}

			mediaQuery.addEventListener("change", handleChange)
			return () => mediaQuery.removeEventListener("change", handleChange)
		}
	}, [theme, isHydrated])

	const value = {
		theme,
		setTheme: (theme: Theme) => {
			if (typeof window !== "undefined") {
				localStorage.setItem(storageKey, theme)
			}
			setTheme(theme)
		},
	}

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	)
}

export const useTheme = () => {
	const context = React.useContext(ThemeProviderContext)

	if (context === undefined)
		throw new Error("useTheme must be used within a ThemeProvider")

	return context
}