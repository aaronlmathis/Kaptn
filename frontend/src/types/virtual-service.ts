import { z } from "zod"

// VirtualService schema matching the API response
export const virtualServiceSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	gateways: z.array(z.string()),
	hosts: z.array(z.string()),
	age: z.string(),
})

// API response types
export interface VirtualServiceApiItem {
	name: string
	namespace: string
	gateways?: string[]
	hosts?: string[]
	age?: string
	labels?: Record<string, string>
}

export interface VirtualServiceApiResponse {
	status: string
	data?: {
		items: VirtualServiceApiItem[]
		continue?: string
	}
	error?: string
}
