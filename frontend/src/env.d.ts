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

export {};
