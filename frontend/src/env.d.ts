/// <reference types="astro/client" />

// Extend Astro's locals with authentication data
declare global {
	namespace App {
		interface Locals {
			user?: {
				id: string;
				email: string;
				name?: string;
				roles?: string[];
				perms?: string[];
			};
			isAuthenticated?: boolean;
			trace_id?: string;
		}
	}
}

interface ImportMetaEnv {
	readonly KAPTN_BUILD_AUTH_MODE: string | undefined;
	readonly INTERNAL_API_URL: string | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export { };
