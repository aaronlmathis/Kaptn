// Session types for Kaptn application

export interface KaptnSession {
	id: string;
	email: string;
	name: string;
	picture: string;
	isAuthenticated: boolean;
	authMode: string;
	csrfToken?: string;
}

// Extend window interface to include Kaptn session
declare global {
	interface Window {
		__KAPTN_SESSION__?: KaptnSession;
	}
}
