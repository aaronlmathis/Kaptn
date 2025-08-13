import { type CRDTableRow, type CRDDetails, type CRDListResponse, type CRDDetailResponse, type CRDFilterOptions } from '@/types/crd';

const API_BASE = '/api/v1';

/**
 * Fetch CRDs from the API with optional filtering and pagination
 */
export async function getCRDs(options: CRDFilterOptions = {}): Promise<CRDTableRow[]> {
	const params = new URLSearchParams();

	if (options.search) params.append('search', options.search);
	if (options.group) params.append('group', options.group);
	if (options.version) params.append('version', options.version);
	if (options.scope && options.scope !== 'all') params.append('scope', options.scope);
	if (options.sortBy) params.append('sortBy', options.sortBy);
	if (options.page) params.append('page', options.page.toString());
	if (options.pageSize) params.append('pageSize', options.pageSize.toString());

	const url = `${API_BASE}/crds${params.toString() ? `?${params.toString()}` : ''}`;

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch CRDs: ${response.statusText}`);
	}

	const data: CRDListResponse = await response.json();

	if (data.status === 'error') {
		throw new Error(data.error || 'Failed to fetch CRDs');
	}

	return data.data.items;
}

/**
 * Fetch detailed information for a specific CRD
 */
export async function getCRDDetails(name: string): Promise<CRDDetails> {
	const response = await fetch(`${API_BASE}/crds/${encodeURIComponent(name)}`);

	if (!response.ok) {
		throw new Error(`Failed to fetch CRD details: ${response.statusText}`);
	}

	const data: CRDDetailResponse = await response.json();

	if (data.status === 'error') {
		throw new Error(data.error || 'Failed to fetch CRD details');
	}

	return data.data;
}

/**
 * Transform CRDs from API response to UI format
 */
export function transformCRDsToUI(crds: CRDTableRow[]): CRDTableRow[] {
	return crds.map((crd, index) => ({
		...crd,
		id: crd.id || index, // Ensure each CRD has an ID
	}));
}

/**
 * Get unique groups from CRDs for filtering
 */
export function getUniqueGroups(crds: CRDTableRow[]): string[] {
	const groups = new Set(crds.map(crd => crd.group));
	return Array.from(groups).sort();
}

/**
 * Get unique versions from CRDs for filtering
 */
export function getUniqueVersions(crds: CRDTableRow[]): string[] {
	const versions = new Set<string>();
	crds.forEach(crd => {
		crd.versions.forEach(version => versions.add(version));
	});
	return Array.from(versions).sort();
}

/**
 * Get unique scopes from CRDs for filtering
 */
export function getUniqueScopes(crds: CRDTableRow[]): string[] {
	const scopes = new Set(crds.map(crd => crd.scope));
	return Array.from(scopes).sort();
}

/**
 * Get unique statuses from CRDs for filtering
 */
export function getUniqueStatuses(crds: CRDTableRow[]): string[] {
	const statuses = new Set(crds.map(crd => crd.status));
	return Array.from(statuses).sort();
}

/**
 * Filter CRDs by text search
 */
export function filterCRDsBySearch(crds: CRDTableRow[], searchTerm: string): CRDTableRow[] {
	if (!searchTerm) return crds;

	const search = searchTerm.toLowerCase();
	return crds.filter(crd =>
		crd.name.toLowerCase().includes(search) ||
		crd.group.toLowerCase().includes(search) ||
		crd.kind.toLowerCase().includes(search) ||
		crd.plural.toLowerCase().includes(search) ||
		crd.singular.toLowerCase().includes(search) ||
		crd.scope.toLowerCase().includes(search) ||
		crd.status.toLowerCase().includes(search) ||
		crd.versions.some(version => version.toLowerCase().includes(search))
	);
}

/**
 * Sort CRDs by specified field
 */
export function sortCRDs(crds: CRDTableRow[], sortBy: string, order: 'asc' | 'desc' = 'asc'): CRDTableRow[] {
	const sorted = [...crds].sort((a, b) => {
		let aVal: string | number;
		let bVal: string | number;

		switch (sortBy) {
			case 'name':
				aVal = a.name;
				bVal = b.name;
				break;
			case 'group':
				aVal = a.group;
				bVal = b.group;
				break;
			case 'kind':
				aVal = a.kind;
				bVal = b.kind;
				break;
			case 'scope':
				aVal = a.scope;
				bVal = b.scope;
				break;
			case 'status':
				aVal = a.status;
				bVal = b.status;
				break;
			case 'age':
				aVal = new Date(a.creationTimestamp).getTime();
				bVal = new Date(b.creationTimestamp).getTime();
				break;
			default:
				aVal = a.name;
				bVal = b.name;
		}

		if (typeof aVal === 'string' && typeof bVal === 'string') {
			return order === 'asc'
				? aVal.localeCompare(bVal)
				: bVal.localeCompare(aVal);
		}

		if (typeof aVal === 'number' && typeof bVal === 'number') {
			return order === 'asc' ? aVal - bVal : bVal - aVal;
		}

		return 0;
	});

	return sorted;
}
