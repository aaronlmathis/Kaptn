import { useState, useCallback, useEffect } from 'react';
import { searchResources, mockSearchResources, type GroupedSearchResults } from '@/lib/k8s-search';

interface UseSearchOptions {
	debounceMs?: number;
	useMockData?: boolean;
	resourceTypes?: string[];
	namespace?: string;
}

interface UseSearchResult {
	results: GroupedSearchResults;
	loading: boolean;
	error: string | null;
	search: (query: string) => Promise<void>;
	clearResults: () => void;
}

/**
 * Hook for searching Kubernetes resources with debouncing
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchResult {
	const {
		useMockData = false,
		resourceTypes,
		namespace,
	} = options;

	const [results, setResults] = useState<GroupedSearchResults>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const search = useCallback(async (query: string) => {
		if (!query.trim()) {
			setResults({});
			setLoading(false);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			let searchResults: GroupedSearchResults;

			if (useMockData) {
				// Simulate API delay
				await new Promise(resolve => setTimeout(resolve, 200));
				searchResults = mockSearchResources(query);
			} else {
				searchResults = await searchResources(query, resourceTypes, namespace);
			}

			setResults(searchResults);
		} catch (err) {
			console.error('Search error:', err);
			setError(err instanceof Error ? err.message : 'An error occurred while searching');
			setResults({});
		} finally {
			setLoading(false);
		}
	}, [useMockData, resourceTypes, namespace]);

	const clearResults = useCallback(() => {
		setResults({});
		setError(null);
		setLoading(false);
	}, []);

	return {
		results,
		loading,
		error,
		search,
		clearResults,
	};
}

/**
 * Hook for debounced search with automatic query handling
 */
export function useDebouncedSearch(
	query: string,
	options: UseSearchOptions = {}
): Omit<UseSearchResult, 'search'> {
	const { debounceMs = 300 } = options;
	const { results, loading, error, search, clearResults } = useSearch(options);

	useEffect(() => {
		if (!query.trim()) {
			clearResults();
			return;
		}

		const timeoutId = setTimeout(() => {
			search(query);
		}, debounceMs);

		return () => clearTimeout(timeoutId);
	}, [query, search, clearResults, debounceMs]);

	return {
		results,
		loading,
		error,
		clearResults,
	};
}
