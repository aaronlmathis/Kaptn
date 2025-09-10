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
	const [theme, setTheme] = React.useState<Theme>(defaultTheme)

	// Hydrate theme from localStorage after mount
	React.useEffect(() => {
		if (typeof window !== "undefined") {
			const storedTheme = localStorage.getItem(storageKey) as Theme
			if (storedTheme) {
				setTheme(storedTheme)
			}
		}
	}, [storageKey])

	React.useEffect(() => {
		if (typeof window === "undefined") return

		const root = window.document.documentElement

		let targetTheme: string
		if (theme === "system") {
			targetTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
		} else {
			targetTheme = theme
		}

		// Since Astro already set the initial theme, only update if different
		const currentHasLight = root.classList.contains("light")
		const currentHasDark = root.classList.contains("dark")
		
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
				const newTheme = mediaQuery.matches ? "dark" : "light"
				root.classList.remove("light", "dark")
				root.classList.add(newTheme)
			}

			mediaQuery.addEventListener("change", handleChange)
			return () => mediaQuery.removeEventListener("change", handleChange)
		}
	}, [theme])

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