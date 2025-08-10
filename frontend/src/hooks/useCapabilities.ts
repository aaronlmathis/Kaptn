import { useContext } from "react";
import { CapabilitiesContext, type CapabilitiesContextType, type Capabilities } from "../contexts/capabilities-context";

// Default capabilities state
const defaultCapabilities: Capabilities = {
	istio: {
		installed: false,
		used: false,
		crds: [],
		counts: {
			virtualservices: 0,
			gateways: 0,
		},
	},
};

export function useCapabilities(): CapabilitiesContextType {
	const context = useContext(CapabilitiesContext);
	if (context === undefined) {
		throw new Error("useCapabilities must be used within a CapabilitiesProvider");
	}
	return context;
}

// Helper hooks for specific capabilities
export function useIstioCapabilities() {
	const { capabilities } = useCapabilities();
	return capabilities?.istio || defaultCapabilities.istio;
}
