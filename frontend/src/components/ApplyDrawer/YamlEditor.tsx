"use client"

import React, { Suspense, useMemo } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useTheme } from '@/components/theme-provider'

// Dynamic import for Monaco Editor (client-side only)
const MonacoEditor = React.lazy(() =>
	import('@monaco-editor/react').then(module => ({
		default: module.Editor
	}))
)

interface YamlEditorProps {
	value: string
	onChange: (value: string) => void
	height?: string | number
	readOnly?: boolean
	className?: string
}

/**
 * YamlEditor component wraps Monaco Editor with YAML-specific configuration.
 * 
 * Features:
 * - YAML syntax highlighting
 * - Dark/light theme support
 * - Line numbers and folding
 * - Auto-formatting and proper indentation
 * - Error highlighting
 */
export function YamlEditor({
	value,
	onChange,
	height = "400px",
	readOnly = false,
	className,
}: YamlEditorProps) {
	const { theme } = useTheme()

	const handleChange = (value: string | undefined) => {
		onChange(value || '')
	}

	// Resolve the actual theme (handle "system" preference)
	const resolvedTheme = useMemo(() => {
		if (theme === "system") {
			// Check system preference
			if (typeof window !== "undefined") {
				return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
			}
			return "light" // fallback
		}
		return theme
	}, [theme])

	const editorOptions = {
		minimap: { enabled: false },
		automaticLayout: true,
		scrollBeyondLastLine: false,
		fontSize: 14,
		tabSize: 2,
		insertSpaces: true,
		wordWrap: 'on' as const,
		lineNumbers: 'on' as const,
		folding: true,
		renderWhitespace: 'boundary' as const,
		bracketPairColorization: {
			enabled: true,
		},
		suggest: {
			showKeywords: true,
			showSnippets: true,
		},
		quickSuggestions: {
			other: true,
			comments: false,
			strings: false,
		},
		parameterHints: {
			enabled: true,
		},
		formatOnPaste: true,
		formatOnType: true,
		readOnly,
	}

	const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'

	return (
		<div className={`${className} overflow-hidden rounded-lg`}>
			<Suspense
				fallback={
					<div
						className="flex items-center justify-center border rounded-lg bg-muted"
						style={{ height }}
					>
						<IconLoader2 className="h-8 w-8 animate-spin" />
						<span className="ml-2">Loading editor...</span>
					</div>
				}
			>
				<div className="rounded-lg overflow-hidden">
					<MonacoEditor
						height={height}
						defaultLanguage="yaml"
						value={value}
						onChange={handleChange}
						options={editorOptions}
						theme={editorTheme}
					/>
				</div>
			</Suspense>
		</div>
	)
}
