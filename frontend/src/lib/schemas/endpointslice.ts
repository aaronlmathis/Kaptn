import { z } from "zod"

// EndpointSlice schema
export const endpointSliceSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	age: z.string(),
	addressType: z.string(),
	endpoints: z.number(),
	ready: z.string(),
	readyCount: z.number(),
	notReadyCount: z.number(),
	ports: z.number(),
	addresses: z.array(z.string()).nullable(),
	portStrings: z.array(z.string()).nullable(),
	addressesDisplay: z.string(),
	portsDisplay: z.string(),
})

export type EndpointSlice = z.infer<typeof endpointSliceSchema>
