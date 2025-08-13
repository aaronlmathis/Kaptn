export interface CRDTableRow {
	id: number;
	name: string;
	group: string;
	kind: string;
	plural: string;
	singular: string;
	scope: string;
	versions: string[];
	storedVersions: string[];
	status: string;
	established: boolean;
	namesAccepted: boolean;
	age: string;
	creationTimestamp: string;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

export interface CRDDetails {
	summary: CRDTableRow;
	spec: {
		group: string;
		versions: Array<{
			name: string;
			served: boolean;
			storage: boolean;
			schema?: Record<string, unknown>;
			additionalPrinterColumns?: Array<{
				name: string;
				type: string;
				description?: string;
				jsonPath: string;
			}>;
		}>;
		scope: "Namespaced" | "Cluster";
		names: {
			plural: string;
			singular: string;
			kind: string;
			shortNames?: string[];
			listKind?: string;
			categories?: string[];
		};
		preserveUnknownFields?: boolean;
		conversion?: {
			strategy: string;
			webhook?: Record<string, unknown>;
		};
	};
	status?: {
		conditions?: Array<{
			type: string;
			status: string;
			lastTransitionTime: string;
			reason?: string;
			message?: string;
		}>;
		acceptedNames?: {
			plural: string;
			singular: string;
			kind: string;
			shortNames?: string[];
			listKind?: string;
			categories?: string[];
		};
		storedVersions?: string[];
	};
	metadata: {
		name: string;
		uid: string;
		resourceVersion: string;
		generation: number;
		creationTimestamp: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
		finalizers?: string[];
	};
	kind: "CustomResourceDefinition";
	apiVersion: string;
}

export interface CRDListResponse {
	data: {
		items: CRDTableRow[];
		total: number;
		page: number;
		pageSize: number;
	};
	status: string;
	error?: string;
}

export interface CRDDetailResponse {
	data: CRDDetails;
	status: string;
	error?: string;
}

export type CRDScope = "Namespaced" | "Cluster" | "all";
export type CRDStatus = "Established" | "Not Ready" | "Terminating" | "Unknown" | "all";

export interface CRDFilterOptions {
	search?: string;
	group?: string;
	version?: string;
	scope?: CRDScope;
	status?: CRDStatus;
	sortBy?: string;
	page?: number;
	pageSize?: number;
}
