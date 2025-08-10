"use client"

import * as React from "react";

const { useEffect, useState } = React;

// Types for capabilities
export interface IstioCapabilities {
	installed: boolean;
	used: boolean;
	crds: string[];
	counts: {
		virtualservices: number;
		gateways: number;
	};
}

export interface Capabilities {
	istio: IstioCapabilities;
}

export interface CapabilitiesContextType {
	capabilities: Capabilities | null;
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

const CapabilitiesContext = React.createContext<CapabilitiesContextType | undefined>(undefined);

export { CapabilitiesContext };

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

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
	const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchCapabilities = async (): Promise<void> => {
		try {
			setIsLoading(true);
			setError(null);

			const response = await fetch("/api/v1/capabilities");

			if (!response.ok) {
				throw new Error(`Failed to fetch capabilities: ${response.statusText}`);
			}

			const result = await response.json();

			if (result.status === "success" && result.data) {
				setCapabilities(result.data);
			} else {
				throw new Error(result.error || "Failed to fetch capabilities");
			}
		} catch (err) {
			console.error("Error fetching capabilities:", err);
			setError(err instanceof Error ? err.message : "Unknown error");
			// Set default capabilities on error to prevent crashes
			setCapabilities(defaultCapabilities);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchCapabilities();
	}, []);

	const value: CapabilitiesContextType = {
		capabilities,
		isLoading,
		error,
		refresh: fetchCapabilities,
	};

	return (
		<CapabilitiesContext.Provider value={value}>
			{children}
		</CapabilitiesContext.Provider>
	);
}
