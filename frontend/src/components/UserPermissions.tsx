import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Eye, Edit, Trash, Plus } from 'lucide-react';

interface ResourcePermissions {
	pods: string[];
	deployments: string[];
	services: string[];
	secrets: string[];
}

interface NamespacePermissions {
	user_email: string;
	permissions: Record<string, ResourcePermissions>;
}

const PermissionIcon = ({ verb }: { verb: string }) => {
	switch (verb) {
		case 'get':
		case 'list':
		case 'watch':
			return <Eye className="w-3 h-3" />;
		case 'create':
			return <Plus className="w-3 h-3" />;
		case 'update':
		case 'patch':
			return <Edit className="w-3 h-3" />;
		case 'delete':
			return <Trash className="w-3 h-3" />;
		default:
			return <Shield className="w-3 h-3" />;
	}
};

const PermissionBadge = ({ verb }: { verb: string }) => {
	const getVariant = (verb: string) => {
		switch (verb) {
			case 'get':
			case 'list':
			case 'watch':
				return 'secondary';
			case 'create':
				return 'default';
			case 'update':
			case 'patch':
				return 'outline';
			case 'delete':
				return 'destructive';
			default:
				return 'secondary';
		}
	};

	return (
		<Badge variant={getVariant(verb)} className="flex items-center gap-1 text-xs">
			<PermissionIcon verb={verb} />
			{verb}
		</Badge>
	);
};

const ResourceCard = ({
	resourceType,
	permissions,
	namespace: _namespace
}: {
	resourceType: string;
	permissions: string[];
	namespace: string;
}) => {
	if (permissions.length === 0) return null;

	const getResourceIcon = (type: string) => {
		switch (type) {
			case 'secrets':
				return <Lock className="w-4 h-4" />;
			default:
				return <Shield className="w-4 h-4" />;
		}
	};

	return (
		<div className="border rounded-lg p-3 space-y-2">
			<div className="flex items-center gap-2 font-medium text-sm">
				{getResourceIcon(resourceType)}
				{resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}
			</div>
			<div className="flex flex-wrap gap-1">
				{permissions.map((verb) => (
					<PermissionBadge key={verb} verb={verb} />
				))}
			</div>
		</div>
	);
};

const NamespaceCard = ({
	namespace,
	permissions
}: {
	namespace: string;
	permissions: ResourcePermissions;
}) => {
	const hasAnyPermissions = Object.values(permissions).some(perms => perms.length > 0);

	if (!hasAnyPermissions) return null;

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-lg flex items-center gap-2">
					<Shield className="w-5 h-5" />
					{namespace}
				</CardTitle>
				<CardDescription>
					Your permissions in this namespace
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<ResourceCard resourceType="pods" permissions={permissions.pods} namespace={namespace} />
				<ResourceCard resourceType="deployments" permissions={permissions.deployments} namespace={namespace} />
				<ResourceCard resourceType="services" permissions={permissions.services} namespace={namespace} />
				<ResourceCard resourceType="secrets" permissions={permissions.secrets} namespace={namespace} />
			</CardContent>
		</Card>
	);
};

export function UserPermissions() {
	const [permissions, setPermissions] = useState<NamespacePermissions | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchPermissions();
	}, []);

	const fetchPermissions = async () => {
		try {
			setLoading(true);
			const response = await fetch('/api/v1/permissions/namespaces');

			if (!response.ok) {
				throw new Error(`Failed to fetch permissions: ${response.statusText}`);
			}

			const data = await response.json();
			setPermissions(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="h-8 bg-gray-200 rounded animate-pulse" />
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-48 bg-gray-200 rounded animate-pulse" />
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="pt-6">
					<div className="text-center space-y-4">
						<Shield className="w-12 h-12 mx-auto text-gray-400" />
						<div>
							<h3 className="text-lg font-medium">Error Loading Permissions</h3>
							<p className="text-gray-600">{error}</p>
						</div>
						<Button onClick={fetchPermissions} variant="outline">
							Try Again
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!permissions || Object.keys(permissions.permissions).length === 0) {
		return (
			<Card>
				<CardContent className="pt-6">
					<div className="text-center space-y-4">
						<Lock className="w-12 h-12 mx-auto text-gray-400" />
						<div>
							<h3 className="text-lg font-medium">No Permissions Found</h3>
							<p className="text-gray-600">
								You don't have access to any namespaces or resources.
								Contact your administrator for access.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">Your Permissions</h2>
				<p className="text-gray-600">
					Logged in as <span className="font-medium">{permissions.user_email}</span>
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{Object.entries(permissions.permissions).map(([namespace, perms]) => (
					<NamespaceCard
						key={namespace}
						namespace={namespace}
						permissions={perms}
					/>
				))}
			</div>
		</div>
	);
}
