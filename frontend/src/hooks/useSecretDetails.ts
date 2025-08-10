import { useState, useEffect } from 'react';
import { getSecret, type SecretDetails } from '@/lib/k8s-storage';

export function useSecretDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<SecretDetails | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			return;
		}

		let isCancelled = false;

		const fetchDetails = async () => {
			setLoading(true);
			setError(null);

			try {
				const details = await getSecret(namespace, name);
				if (!isCancelled) {
					setData(details);
				}
			} catch (err) {
				if (!isCancelled) {
					setError(err instanceof Error ? err.message : 'Failed to fetch secret details');
				}
			} finally {
				if (!isCancelled) {
					setLoading(false);
				}
			}
		};

		fetchDetails();

		return () => {
			isCancelled = true;
		};
	}, [namespace, name, enabled]);

	return { data, loading, error };
}
