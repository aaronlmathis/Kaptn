import type { MiddlewareHandler } from 'astro';

// Types for user data
interface User {
	id: string;
	email: string;
	name?: string;
	roles?: string[];
	perms?: string[];
}

interface AccessTokenClaims {
	sub: string;
	email: string;
	name?: string;
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
		const refreshResponse = await fetch('http://localhost:8080/api/v1/auth/refresh', {
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

// Main middleware function
export const onRequest: MiddlewareHandler = async (context, next) => {
	const { request, locals, url } = context;

	// Skip auth for public paths
	const publicPaths = ['/login', '/callback', '/api/v1/auth', '/healthz', '/readyz'];
	if (publicPaths.some(path => url.pathname.startsWith(path))) {
		return next();
	}

	// Extract access token from cookies
	const cookies = request.headers.get('Cookie') || '';
	const accessTokenMatch = cookies.match(/kaptn-access-token=([^;]+)/);
	const accessToken = accessTokenMatch ? accessTokenMatch[1] : '';

	if (!accessToken) {
		// No access token - redirect to login
		console.log('No access token found, redirecting to login');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login',
			},
		});
	}

	// Verify access token
	const claims = await verifyAccessToken(accessToken);
	if (!claims) {
		// Invalid token - try refresh or redirect to login
		console.log('Invalid access token, attempting refresh');

		const refreshResult = await attemptRefresh(request);
		if (refreshResult) {
			// Successful refresh - create new response with updated cookies
			const response = await next();

			// Set new cookies in response
			response.headers.set('Set-Cookie',
				`kaptn-access-token=${refreshResult.accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`);
			response.headers.append('Set-Cookie',
				`kaptn-refresh-token=${refreshResult.refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);

			// Re-verify the new token and set user context
			const newClaims = await verifyAccessToken(refreshResult.accessToken);
			if (newClaims) {
				locals.user = createUserSnapshot(newClaims);
				locals.isAuthenticated = true;
				locals.trace_id = newClaims.trace_id;
			}

			return response;
		}

		// Refresh failed - redirect to login
		console.log('Token refresh failed, redirecting to login');
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/login',
			},
		});
	}

	// Valid token - set user context
	locals.user = createUserSnapshot(claims);
	locals.isAuthenticated = true;
	locals.trace_id = claims.trace_id;

	// Check if token is near expiry and attempt proactive refresh
	if (isTokenNearExpiry(claims)) {
		console.log('Token near expiry, attempting proactive refresh');
		const refreshResult = await attemptRefresh(request);
		if (refreshResult) {
			// Update response with new cookies
			const response = await next();

			response.headers.set('Set-Cookie',
				`kaptn-access-token=${refreshResult.accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`);
			response.headers.append('Set-Cookie',
				`kaptn-refresh-token=${refreshResult.refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);

			return response;
		}
	}

	return next();
};
