import { useEffect, useState, useCallback } from 'react';

// Types for permission checking
export interface PermissionCheck {
	verb: string;
	resource: string;
	namespace?: string;
	name?: string;
}

export interface ActionPermissions {
	can_deploy: boolean;
	can_scale: boolean;
	can_delete: boolean;
	can_edit_secrets: boolean;
	can_create_namespace: boolean;
	can_view_logs: boolean;
	can_exec: boolean;
}

export interface PermissionResult {
	allowed: boolean;
	verb: string;
	resource: string;
	namespace?: string;
	name?: string;
	user: string;
}

export interface PageAccessResult {
	allowed: boolean;
	resource: string;
	namespace?: string;
	user: string;
}

// Hook for checking individual permissions
export function usePermissionCheck() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const checkPermission = useCallback(async (
		verb: string,
		resource: string,
		namespace?: string,
		name?: string
	): Promise<boolean> => {
		setLoading(true);
		setError(null);

		try {
			const params = new URLSearchParams({
				verb,
				resource,
				...(namespace && { namespace }),
				...(name && { name }),
			});

			const response = await fetch(`/api/v1/permissions/check?${params}`);

			if (!response.ok) {
				throw new Error(`Permission check failed: ${response.statusText}`);
			}

			const result: PermissionResult = await response.json();
			return result.allowed;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
			return false;
		} finally {
			setLoading(false);
		}
	}, []);

	const checkPageAccess = useCallback(async (
		resource: string,
		namespace?: string
	): Promise<boolean> => {
		setLoading(true);
		setError(null);

		try {
			const params = new URLSearchParams({
				resource,
				...(namespace && { namespace }),
			});

			const response = await fetch(`/api/v1/permissions/page-access?${params}`);

			if (!response.ok) {
				throw new Error(`Page access check failed: ${response.statusText}`);
			}

			const result: PageAccessResult = await response.json();
			return result.allowed;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
			return false;
		} finally {
			setLoading(false);
		}
	}, []);

	const checkBulkPermissions = useCallback(async (
		checks: PermissionCheck[]
	): Promise<Record<string, boolean>> => {
		setLoading(true);
		setError(null);

		try {
			const response = await fetch('/api/v1/permissions/bulk-check', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ checks }),
			});

			if (!response.ok) {
				throw new Error(`Bulk permission check failed: ${response.statusText}`);
			}

			const result = await response.json();
			return result.results;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
			return {};
		} finally {
			setLoading(false);
		}
	}, []);

	return {
		checkPermission,
		checkPageAccess,
		checkBulkPermissions,
		loading,
		error,
	};
}

// Hook for getting action permissions for a namespace
export function useActionPermissions(namespace?: string) {
	const [permissions, setPermissions] = useState<ActionPermissions | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchPermissions = useCallback(async (ns?: string) => {
		setLoading(true);
		setError(null);

		try {
			const url = ns
				? `/api/v1/permissions/actions/${ns}`
				: '/api/v1/permissions/actions';

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Failed to fetch permissions: ${response.statusText}`);
			}

			const result = await response.json();
			setPermissions(result.permissions);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
			setPermissions(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchPermissions(namespace);
	}, [namespace, fetchPermissions]);

	const refresh = useCallback(() => {
		fetchPermissions(namespace);
	}, [namespace, fetchPermissions]);

	return {
		permissions,
		loading,
		error,
		refresh,
	};
}

// Helper hook for common permission checks
export function useCommonPermissions(namespace?: string) {
	const { checkPermission, loading, error } = usePermissionCheck();
	const [permissions, setPermissions] = useState({
		canDeploy: false,
		canScale: false,
		canDelete: false,
		canViewLogs: false,
		canExec: false,
		canCreateSecrets: false,
		canEditSecrets: false,
		canCreateNamespace: false,
	});

	const checkAllPermissions = useCallback(async () => {
		if (!namespace) return;

		const [
			canDeploy,
			canScale,
			canDelete,
			canViewLogs,
			canExec,
			canCreateSecrets,
			canEditSecrets,
			canCreateNamespace,
		] = await Promise.all([
			checkPermission('create', 'deployments', namespace),
			checkPermission('patch', 'deployments', namespace),
			checkPermission('delete', 'pods', namespace),
			checkPermission('get', 'pods/log', namespace),
			checkPermission('create', 'pods/exec', namespace),
			checkPermission('create', 'secrets', namespace),
			checkPermission('update', 'secrets', namespace),
			checkPermission('create', 'namespaces'),
		]);

		setPermissions({
			canDeploy,
			canScale,
			canDelete,
			canViewLogs,
			canExec,
			canCreateSecrets,
			canEditSecrets,
			canCreateNamespace,
		});
	}, [namespace, checkPermission]);

	useEffect(() => {
		checkAllPermissions();
	}, [checkAllPermissions]);

	return {
		permissions,
		loading,
		error,
		refresh: checkAllPermissions,
	};
}

// Hook for page-level access control
export function usePageAccess(resource: string, namespace?: string) {
	const [hasAccess, setHasAccess] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const { checkPageAccess } = usePermissionCheck();

	useEffect(() => {
		const checkAccess = async () => {
			setLoading(true);
			setError(null);

			try {
				const allowed = await checkPageAccess(resource, namespace);
				setHasAccess(allowed);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error');
				setHasAccess(false);
			} finally {
				setLoading(false);
			}
		};

		checkAccess();
	}, [resource, namespace, checkPageAccess]);

	return {
		hasAccess,
		loading,
		error,
	};
}
