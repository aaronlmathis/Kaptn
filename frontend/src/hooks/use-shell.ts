import { useContext } from 'react'
import { ShellContext, type ShellContextValue } from '@/contexts/shell-context'

export const useShell = (): ShellContextValue => {
	const context = useContext(ShellContext)
	if (context === undefined) {
		throw new Error('useShell must be used within a ShellProvider')
	}
	return context
}
