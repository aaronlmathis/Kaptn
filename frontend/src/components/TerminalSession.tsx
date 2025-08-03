import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useShell } from '@/hooks/use-shell'
import { Button } from '@/components/ui/button'
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

export function TerminalSession({ pod, container, namespace, tabId }: TerminalSessionProps) {
	const [isConnected, setIsConnected] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [output, setOutput] = useState<string[]>([])
	const [input, setInput] = useState('')
	const wsRef = useRef<WebSocket | null>(null)
	const terminalRef = useRef<HTMLDivElement>(null)
	const { updateTabStatus } = useShell()

	const connect = useCallback(() => {
		try {
			setError(null)
			updateTabStatus(tabId, 'connecting')

			// Create WebSocket URL for exec session
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
			const sessionId = crypto.randomUUID()
			// Use the same host as the current page (for production) but backend port for development
			const isDev = window.location.port === '4321' || window.location.port === '4322'
			const host = isDev ? `${window.location.hostname}:8080` : window.location.host
			const wsUrl = `${protocol}//${host}/api/v1/exec/${sessionId}?namespace=${namespace}&pod=${pod}&container=${container}&command=/bin/sh&tty=true`

			console.log('Connecting to WebSocket:', wsUrl)

			const ws = new WebSocket(wsUrl)
			wsRef.current = ws

			ws.onopen = () => {
				setIsConnected(true)
				updateTabStatus(tabId, 'connected')
				setOutput(prev => [...prev, `Connected to ${pod}/${container} in ${namespace}`])
			}

			ws.onmessage = (event) => {
				try {
					const message: ExecMessage = JSON.parse(event.data)

					switch (message.type) {
						case 'stdout':
						case 'stderr':
							if (message.data) {
								setOutput(prev => [...prev, message.data as string])
							}
							break
						case 'error':
							setError(message.data || 'Unknown error occurred')
							updateTabStatus(tabId, 'error', message.data)
							break
					}
				} catch (err) {
					console.error('Failed to parse WebSocket message:', err)
				}
			}

			ws.onclose = (event) => {
				setIsConnected(false)
				updateTabStatus(tabId, 'closed')

				if (event.code !== 1000) {
					setError(`Connection closed unexpectedly (code: ${event.code})`)
				}
			}

			ws.onerror = () => {
				setError('WebSocket connection failed')
				updateTabStatus(tabId, 'error', 'WebSocket connection failed')
			}

		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to connect')
			updateTabStatus(tabId, 'error', 'Failed to connect')
		}
	}, [pod, container, namespace, tabId, updateTabStatus])

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
			disconnect()
		}
	}, [connect])

	// Focus on terminal when tab becomes active
	useEffect(() => {
		if (terminalRef.current) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight
		}
	}, [output])

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
		<div className="flex flex-col h-full bg-black text-green-400 font-mono text-sm">
			{/* Terminal Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
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
				ref={terminalRef}
				className="flex-1 p-3 overflow-y-auto"
				style={{ fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace' }}
			>
				{output.map((line, index) => (
					<div key={index} className="whitespace-pre-wrap break-words">
						{line}
					</div>
				))}

				{/* Current Input Line */}
				{isConnected && (
					<div className="flex items-center mt-2">
						<span className="text-yellow-400 mr-2">$</span>
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyPress={handleKeyPress}
							className="flex-1 bg-transparent border-none outline-none text-green-400"
							placeholder="Type command and press Enter..."
							autoFocus
						/>
					</div>
				)}
			</div>
		</div>
	)
}
