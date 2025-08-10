import * as React from "react";

// Istio capabilities structure
export interface IstioCapabilities {
	installed: boolean;
	used: boolean;
	crds: string[];
	counts: {
		virtualservices: number;
		gateways: number;
	};
}

// Full capabilities object
export interface Capabilities {
	istio: IstioCapabilities;
}

// Context type including state and actions
export interface CapabilitiesContextType {
	capabilities: Capabilities | null;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export const CapabilitiesContext = React.createContext<CapabilitiesContextType | undefined>(undefined);
