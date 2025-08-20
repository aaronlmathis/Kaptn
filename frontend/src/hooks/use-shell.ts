import { useContext } from 'react'
import { ShellContext, type ShellContextValue } from '@/contexts/shell-context'

export const useShell = (): ShellContextValue => {
    const context = useContext(ShellContext)
    
    if (context === undefined) {
        // During static build, provide a safe fallback
        if (typeof window === 'undefined') {
            return {
                tabs: [],
                activeTabId: null,
                isDrawerOpen: false,
                openShell: () => '',
                closeShell: () => {},
                closeAllShells: () => {},
                setActiveTab: () => {},
                updateTabStatus: () => {},
                setDrawerOpen: () => {},
            } as ShellContextValue
        }
        
        throw new Error('useShell must be used within a ShellProvider')
    }
    
    return context
}

