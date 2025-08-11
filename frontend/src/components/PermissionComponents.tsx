import React from 'react';
import { usePermissionCheck } from '../hooks/usePermissions';

interface PermissionGateProps {
	verb: string;
	resource: string;
	namespace?: string;
	name?: string;
	children: React.ReactNode;
	fallback?: React.ReactNode;
	loading?: React.ReactNode;
}

/**
 * PermissionGate component for Phase 6 UI gating
 * Shows/hides child components based on user permissions
 */
export function PermissionGate({
	verb,
	resource,
	namespace,
	name,
	children,
	fallback = null,
	loading: loadingComponent = null,
}: PermissionGateProps) {
	const { checkPermission, loading, error } = usePermissionCheck();
	const [hasPermission, setHasPermission] = React.useState<boolean | null>(null);

	React.useEffect(() => {
		const checkAccess = async () => {
			try {
				const allowed = await checkPermission(verb, resource, namespace, name);
				setHasPermission(allowed);
			} catch (err) {
				console.error('Permission check failed:', err);
				setHasPermission(false);
			}
		};

		checkAccess();
	}, [verb, resource, namespace, name, checkPermission]);

	if (loading || hasPermission === null) {
		return loadingComponent ? <>{loadingComponent}</> : null;
	}

	if (error || !hasPermission) {
		return fallback ? <>{fallback}</> : null;
	}

	return <>{children}</>;
}

interface ActionButtonProps {
	verb: string;
	resource: string;
	namespace?: string;
	name?: string;
	onClick: () => void;
	children: React.ReactNode;
	className?: string;
	disabled?: boolean;
	title?: string;
}

/**
 * ActionButton component with built-in permission checking
 * Automatically disables button if user lacks permission
 */
export function ActionButton({
	verb,
	resource,
	namespace,
	name,
	onClick,
	children,
	className = '',
	disabled = false,
	title,
}: ActionButtonProps) {
	const { checkPermission } = usePermissionCheck();
	const [hasPermission, setHasPermission] = React.useState<boolean | null>(null);
	const [checking, setChecking] = React.useState(true);

	React.useEffect(() => {
		const checkAccess = async () => {
			setChecking(true);
			try {
				const allowed = await checkPermission(verb, resource, namespace, name);
				setHasPermission(allowed);
			} catch (err) {
				console.error('Permission check failed:', err);
				setHasPermission(false);
			} finally {
				setChecking(false);
			}
		};

		checkAccess();
	}, [verb, resource, namespace, name, checkPermission]);

	const isDisabled = disabled || checking || !hasPermission;
	const buttonTitle = title || (
		hasPermission === false
			? `No permission to ${verb} ${resource}${namespace ? ` in ${namespace}` : ''}`
			: undefined
	);

	return (
		<button
			onClick={onClick}
			disabled={isDisabled}
			className={className}
			title={buttonTitle}
		>
			{checking ? 'Checking...' : children}
		</button>
	);
}

interface PageAccessGuardProps {
	resource: string;
	namespace?: string;
	children: React.ReactNode;
	noAccessComponent?: React.ReactNode;
}

/**
 * PageAccessGuard component for page-level access control
 * Implements the "page-level gate" requirement from Phase 6
 */
export function PageAccessGuard({
	resource,
	namespace,
	children,
	noAccessComponent,
}: PageAccessGuardProps) {
	const { checkPageAccess } = usePermissionCheck();
	const [hasAccess, setHasAccess] = React.useState<boolean | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const checkAccess = async () => {
			setLoading(true);
			try {
				const allowed = await checkPageAccess(resource, namespace);
				setHasAccess(allowed);
			} catch (err) {
				console.error('Page access check failed:', err);
				setHasAccess(false);
			} finally {
				setLoading(false);
			}
		};

		checkAccess();
	}, [resource, namespace, checkPageAccess]);

	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-sm text-gray-500">Checking permissions...</div>
			</div>
		);
	}

	if (!hasAccess) {
		return noAccessComponent ? (
			<>{noAccessComponent}</>
		) : (
			<div className="flex items-center justify-center p-8">
				<div className="text-center">
					<h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
					<p className="text-sm text-gray-500">
						You don't have permission to view {resource}
						{namespace ? ` in namespace ${namespace}` : ''}.
					</p>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}

interface ConditionalActionProps {
	when: 'can' | 'cannot';
	verb: string;
	resource: string;
	namespace?: string;
	name?: string;
	children: React.ReactNode;
}

/**
 * ConditionalAction component for fine-grained permission-based rendering
 */
export function ConditionalAction({
	when,
	verb,
	resource,
	namespace,
	name,
	children,
}: ConditionalActionProps) {
	const shouldShow = when === 'can';

	return (
		<PermissionGate
			verb={verb}
			resource={resource}
			namespace={namespace}
			name={name}
			fallback={when === 'cannot' ? children : null}
		>
			{shouldShow ? children : null}
		</PermissionGate>
	);
}
