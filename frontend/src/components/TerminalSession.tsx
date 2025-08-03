import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useShell } from '@/hooks/use-shell'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { IconRefresh, IconAlertTriangle } from '@tabler/icons-react'

// We'll need to install xterm for the actual terminal, but for now let's create a placeholder
interface TerminalSessionProps {
	pod: string
	container: string
	namespace: string
	tabId: string
}

interface ExecMessage {
	type: 'stdout' | 'stderr' | 'error' | 'resize' | 'stdin'
	data?: string
	cols?: number
	rows?: number
}

// Function to clean ANSI escape sequences and control characters
const cleanTerminalOutput = (text: string): string => {
	// Remove ANSI escape sequences (colors, cursor movements, etc.)
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
		// Remove other control characters except newline, carriage return, and tab
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
		// Handle carriage returns properly (move cursor to beginning of line)
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
}

export function TerminalSession({ pod, container, namespace, tabId }: TerminalSessionProps) {
	const [isConnected, setIsConnected] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [output, setOutput] = useState<string[]>([])
	const [input, setInput] = useState('')
	const wsRef = useRef<WebSocket | null>(null)
	const terminalRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const outputBufferRef = useRef<string>('')
	const { updateTabStatus } = useShell()

	// Debounced output update to prevent too many renders
	const flushOutputBuffer = useCallback(() => {
		if (outputBufferRef.current) {
			const cleanedData = cleanTerminalOutput(outputBufferRef.current)
			if (cleanedData.trim()) {
				setOutput(prev => {
					// Split by lines and add each as a separate entry
					const lines = cleanedData.split('\n')
					const newLines = lines.filter(line => line.length > 0 || prev.length === 0)
					return [...prev, ...newLines]
				})
			}
			outputBufferRef.current = ''
		}
	}, [])

	const debouncedFlushRef = useRef<number | null>(null)

	// Handle clicking anywhere in the terminal to focus input
	const handleTerminalClick = useCallback(() => {
		if (inputRef.current && isConnected) {
			inputRef.current.focus()
		}
	}, [isConnected])

	const connect = useCallback(() => {
		console.log('=== Starting shell connection ===')
		console.log('Pod:', pod, 'Container:', container, 'Namespace:', namespace, 'TabId:', tabId)

		try {
			setError(null)
			updateTabStatus(tabId, 'connecting')

			// Create WebSocket URL for exec session
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
			const sessionId = crypto.randomUUID()
			// Use the same host as the current page (for production) but backend port for development
			const isDev = window.location.port === '4321' || window.location.port === '4322'
			const host = isDev ? `${window.location.hostname}:8080` : window.location.host

			// If no container specified, let backend auto-detect (pass empty string)
			const containerParam = container || ''
			const wsUrl = `${protocol}//${host}/api/v1/exec/${sessionId}?namespace=${namespace}&pod=${pod}&container=${containerParam}&command=/bin/sh&tty=true`

			console.log('=== WebSocket Connection Details ===')
			console.log('Protocol:', protocol)
			console.log('Host:', host)
			console.log('Session ID:', sessionId)
			console.log('Is Dev Mode:', isDev)
			console.log('Final WebSocket URL:', wsUrl)

			// Validate required parameters (container can be empty for auto-detection)
			if (!pod || !namespace) {
				throw new Error(`Missing required parameters: pod=${pod}, namespace=${namespace}`)
			}

			console.log('Creating WebSocket...')
			const ws = new WebSocket(wsUrl)
			wsRef.current = ws
			console.log('WebSocket created successfully')

			ws.onopen = () => {
				console.log('✅ WebSocket opened successfully')
				setIsConnected(true)
				updateTabStatus(tabId, 'connected')
				setOutput(prev => [...prev, `Connected to ${pod}/${container} in ${namespace}`])
			}

			ws.onmessage = (event) => {
				console.log('WebSocket message received:', event.data)
				try {
					const message: ExecMessage = JSON.parse(event.data)
					console.log('Parsed message:', message)

					switch (message.type) {
						case 'stdout':
						case 'stderr':
							if (message.data) {
								// Buffer the output to prevent too many rapid updates
								outputBufferRef.current += message.data as string

								// Clear existing timeout and set a new one
								if (debouncedFlushRef.current) {
									clearTimeout(debouncedFlushRef.current)
								}
								debouncedFlushRef.current = window.setTimeout(flushOutputBuffer, 50)
							}
							break
						case 'error':
							console.error('Received error message:', message.data)
							setError(message.data || 'Unknown error occurred')
							updateTabStatus(tabId, 'error', message.data)
							break
					}
				} catch (err) {
					console.error('Failed to parse WebSocket message:', err, 'Raw data:', event.data)
				}
			}

			ws.onclose = (event) => {
				console.log('WebSocket closed:', event.code, event.reason)
				setIsConnected(false)
				updateTabStatus(tabId, 'closed')

				if (event.code !== 1000) {
					setError(`Connection closed unexpectedly (code: ${event.code}, reason: ${event.reason})`)
				}
			}

			ws.onerror = (event) => {
				console.error('WebSocket error:', event)
				setError('WebSocket connection failed')
				updateTabStatus(tabId, 'error', 'WebSocket connection failed')
			}

		} catch (err) {
			console.error('❌ Error in connect function:', err)
			const errorMessage = err instanceof Error ? err.message : 'Failed to connect'
			setError(errorMessage)
			updateTabStatus(tabId, 'error', errorMessage)
		}
	}, [pod, container, namespace, tabId, updateTabStatus, flushOutputBuffer])

	const disconnect = () => {
		if (wsRef.current) {
			wsRef.current.close(1000, 'User disconnected')
			wsRef.current = null
		}
	}

	const sendInput = () => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && input.trim()) {
			const message: ExecMessage = {
				type: 'stdin',
				data: input + '\n'
			}
			wsRef.current.send(JSON.stringify(message))
			setOutput(prev => [...prev, `$ ${input}`])
			setInput('')
		}
	}

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			sendInput()
		}
	}

	const retry = () => {
		disconnect()
		setTimeout(connect, 1000)
	}

	useEffect(() => {
		connect()

		return () => {
			// Flush any remaining output before disconnecting
			if (debouncedFlushRef.current) {
				clearTimeout(debouncedFlushRef.current)
				flushOutputBuffer()
			}
			disconnect()
		}
	}, [connect, flushOutputBuffer])

	// Focus when component mounts and is connected
	useEffect(() => {
		if (inputRef.current && isConnected) {
			const timeoutId = setTimeout(() => {
				inputRef.current?.focus()
			}, 200)
			return () => clearTimeout(timeoutId)
		}
	}, [isConnected]) // Focus when connection state changes

	// Focus on terminal when tab becomes active (called whenever output updates)
	useEffect(() => {
		if (terminalRef.current) {
			// Find the ScrollArea viewport and scroll to bottom
			const scrollArea = terminalRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement
			if (scrollArea) {
				scrollArea.scrollTop = scrollArea.scrollHeight
			} else {
				// Fallback to the terminal ref itself
				terminalRef.current.scrollTop = terminalRef.current.scrollHeight
			}
		}
		// Also focus the input when content updates (tab might have just become active)
		if (isConnected && inputRef.current && document.visibilityState === 'visible') {
			inputRef.current.focus()
		}
	}, [output, isConnected])

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-4">
				<div className="text-center space-y-4">
					<IconAlertTriangle className="size-12 text-red-500 mx-auto" />
					<div>
						<h3 className="text-lg font-semibold text-red-600">Connection Failed</h3>
						<p className="text-sm text-muted-foreground mt-1">{error}</p>
					</div>
					<div className="space-y-2">
						<p className="text-xs text-muted-foreground">
							Ensure the pod is running and you have exec permissions.
						</p>
						<Button onClick={retry} size="sm">
							<IconRefresh className="size-4 mr-2" />
							Retry Connection
						</Button>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col h-full bg-black text-green-400 font-mono text-sm max-h-full">
			{/* Terminal Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
				<div className="text-xs text-gray-300">
					{pod}/{container} ({namespace})
				</div>
				<div className="flex items-center space-x-2">
					<div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
					<span className="text-xs text-gray-400">
						{isConnected ? 'Connected' : 'Disconnected'}
					</span>
				</div>
			</div>

			{/* Terminal Output */}
			<div
				className="flex-1 min-h-0 bg-black cursor-text"
				onClick={handleTerminalClick}
				style={{ fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace' }}
			>
				<ScrollArea className="h-full">
					<div ref={terminalRef} className="p-3 text-sm leading-relaxed">
						{output.map((line, index) => (
							<div key={index} className="whitespace-pre-wrap break-words mb-0.5">
								{line || '\u00A0'} {/* Use non-breaking space for empty lines */}
							</div>
						))}

						{/* Current Input Line */}
						{isConnected && (
							<div className="flex items-center mt-2 sticky bottom-0 bg-black">
								<span className="text-yellow-400 mr-2">$</span>
								<input
									ref={inputRef}
									type="text"
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyPress={handleKeyPress}
									className="flex-1 bg-transparent border-none outline-none text-green-400 font-mono"
									placeholder="Type command and press Enter..."
									autoFocus
								/>
							</div>
						)}
					</div>
					<ScrollBar orientation="vertical" />
				</ScrollArea>
			</div>
		</div>
	)
}
