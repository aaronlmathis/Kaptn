import { z } from "zod"

// Gateway schema matching the API response
export const gatewaySchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	ports: z.array(z.object({
		name: z.string().optional(),
		protocol: z.string(),
	})),
	addresses: z.array(z.string()).nullable().optional(),
	labels: z.record(z.string()).nullable().optional(),
	age: z.string(),
})

// API response types
export interface GatewayApiItem {
	name: string
	namespace: string
	ports?: Array<{
		name?: string
		protocol: string
	}>
	addresses?: string[] | null
	labels?: Record<string, string> | null
	age?: string
}

export interface GatewayApiResponse {
	status: string
	data?: {
		items: GatewayApiItem[]
		continue?: string
	}
	error?: string
}
