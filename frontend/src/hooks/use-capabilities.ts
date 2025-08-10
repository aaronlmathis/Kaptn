"use client"

import { useContext } from "react"
import { CapabilitiesContext, type CapabilitiesContextType } from "@/contexts/capabilities-context"

export function useCapabilities(): CapabilitiesContextType {
	const context = useContext(CapabilitiesContext)
	if (!context) {
		throw new Error("useCapabilities must be used within a CapabilitiesProvider")
	}
	return context
}
