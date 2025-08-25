import type { MiddlewareHandler } from 'astro';

// Types for user data
interface User {
	id: string;
	email: string;
	name?: string;
	picture?: string;
	roles?: string[];
	perms?: string[];
}

interface AccessTokenClaims {
	sub: string;
	email: string;
	name?: string;
	picture?: string;
	roles: string[];
	perms: string[];
	session_ver: number;
	jti: string;
	trace_id: string;
	iat: number;
	exp: number;
}

// Simple JWT verification without external dependencies
// Note: This is a basic implementation that skips signature verification
// In production, you should verify the signature using the backend's public key
async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
	try {
		// Basic JWT structure validation
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}

		// Decode payload (skip signature verification for now)
		const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

		// Basic validation
		if (!payload.sub || !payload.email || !payload.jti) {
			console.warn('Invalid token claims structure');
			return null;
		}

		// Check expiration
		if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
			console.warn('Token expired');
			return null;
		}

		return payload as AccessTokenClaims;
	} catch (error) {
		console.warn('Token verification failed:', error);
		return null;
	}
}

// Create minimal user snapshot for client-side use (no sensitive data)
function createUserSnapshot(claims: AccessTokenClaims): User {
	return {
		id: claims.sub,
		email: claims.email,
		name: claims.name,
		picture: claims.picture,
		roles: claims.roles || [],
		perms: claims.perms || [],
	};
}

// Check if token is near expiry (within 2 minutes)
function isTokenNearExpiry(claims: AccessTokenClaims): boolean {
	const now = Math.floor(Date.now() / 1000);
	const timeToExpiry = claims.exp - now;
	return timeToExpiry < 120; // 2 minutes
}

// Attempt server-side refresh
async function attemptRefresh(request: Request): Promise<{ accessToken: string; refreshToken: string } | null> {
	try {
		const refreshResponse = await fetch('/api/v1/auth/refresh', {
			method: 'POST',
			headers: {
				'Cookie': request.headers.get('Cookie') || '',
				'User-Agent': request.headers.get('User-Agent') || '',
				'X-Real-IP': request.headers.get('X-Real-IP') || '',
				'X-Forwarded-For': request.headers.get('X-Forwarded-For') || '',
			},
			credentials: 'include',
		});

		if (refreshResponse.ok) {
			// Extract new tokens from Set-Cookie headers
			const setCookieHeaders = refreshResponse.headers.getSetCookie();
			let accessToken = '';
			let refreshToken = '';

			for (const cookieHeader of setCookieHeaders) {
				if (cookieHeader.includes('kaptn-access-token=')) {
					const match = cookieHeader.match(/kaptn-access-token=([^;]+)/);
					if (match) accessToken = match[1];
				}
				if (cookieHeader.includes('kaptn-refresh-token=')) {
					const match = cookieHeader.match(/kaptn-refresh-token=([^;]+)/);
					if (match) refreshToken = match[1];
				}
			}

			if (accessToken && refreshToken) {
				return { accessToken, refreshToken };
			}
		}
	} catch (error) {
		console.warn('Server-side refresh failed:', error);
	}

	return null;
}

// Check auth mode from backend config
async function getAuthMode(_request: Request): Promise<string> {
	// 1. Check for a build-time override environment variable.
	if (import.meta.env.KAPTN_BUILD_AUTH_MODE) {
		console.log(`🛡️ Middleware: Using build-time auth mode override: ${import.meta.env.KAPTN_BUILD_AUTH_MODE}`);
		return import.meta.env.KAPTN_BUILD_AUTH_MODE;
	}

	// 2. If no override, attempt to fetch from the running backend.
	try {
		const backendUrl = import.meta.env.INTERNAL_API_URL || 'http://localhost:9999';
		const configUrl = `${backendUrl}/api/v1/config`;

		const response = await fetch(configUrl, { signal: AbortSignal.timeout(2000) });

		if (!response.ok) {
			console.error(`Config fetch failed with status: ${response.status}. Defaulting to secure 'oidc' mode.`);
			return 'oidc';
		}

		const config = await response.json();
		return config.auth?.mode || 'oidc';
	} catch (_error) {
		console.warn('Could not connect to backend to fetch auth config. Defaulting to "none" auth mode for build.');
		return 'none';
	}
}

// Create session injection script
function createSessionScript(authMode: string, user: User | null, isAuthenticated: boolean) {
	const sessionData = {
		authMode,
		isAuthenticated,
		id: user?.id,
		email: user?.email,
		name: user?.name,
		picture: user?.picture,
		roles: user?.roles,
		perms: user?.perms,
	};

	return `<script>window.__KAPTN_SESSION__ = ${JSON.stringify(sessionData)};</script>`;
}

// Main middleware function
export const onRequest: MiddlewareHandler = async (context, next) => {
	const { request, locals, url } = context;

	console.log('🛡️ Middleware: Processing request for', url.pathname);

	// Skip auth for public paths
	const publicPaths = ['/login', '/callback', '/api/v1/auth', '/healthz', '/readyz'];
	if (publicPaths.some(path => url.pathname.startsWith(path))) {
		console.log('🛡️ Middleware: Skipping auth for public path', url.pathname);
		return next();
	}

	// Check auth mode first
	const authMode = await getAuthMode(request);
	console.log('🛡️ Middleware: Auth mode result:', authMode);

	let user: User | null = null;
	let isAuthenticated = false;

	if (authMode === 'none') {
		console.log('🛡️ Middleware: Auth mode is none, setting dev user');
		user = {
			id: 'dev-user',
			email: 'dev@localhost',
			name: 'Development User',
			roles: ['admin'],
			perms: ['read', 'write', 'delete', 'admin'],
		};
		isAuthenticated = true;
		locals.trace_id = 'dev-trace-' + Date.now();
	} else {
		// Extract access token from cookies
		const cookies = request.headers.get('Cookie') || '';
		const accessTokenMatch = cookies.match(/kaptn-access-token=([^;]+)/);
		const accessToken = accessTokenMatch ? accessTokenMatch[1] : '';

		if (!accessToken) {
			console.log('No access token found, redirecting to login');
			return new Response(null, {
				status: 302,
				headers: { Location: '/login' },
			});
		}

		// Verify access token
		const claims = await verifyAccessToken(accessToken);
		if (!claims) {
			console.log('Invalid access token, redirecting to login');
			return new Response(null, {
				status: 302,
				headers: { Location: '/login' },
			});
		}

		user = createUserSnapshot(claims);
		isAuthenticated = true;
		locals.trace_id = claims.trace_id;

		// Check if token is near expiry and attempt proactive refresh
		if (isTokenNearExpiry(claims)) {
			console.log('Token is near expiry, attempting proactive refresh...');
			const refreshResult = await attemptRefresh(request);
			if (refreshResult) {
				console.log('Proactive refresh successful');
			} else {
				console.log('Proactive refresh failed, but continuing with current token');
			}
		}
	}

	// Set locals for server-side use
	locals.user = user;
	locals.isAuthenticated = isAuthenticated;

	// Get the response
	const response = await next();

	// Inject session data into HTML responses
	if (response.headers.get('content-type')?.includes('text/html')) {
		const html = await response.text();
		const sessionScript = createSessionScript(authMode, user, isAuthenticated);

		// Inject script before closing head tag
		const modifiedHtml = html.replace('</head>', `${sessionScript}</head>`);

		return new Response(modifiedHtml, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}

	return response;
};
