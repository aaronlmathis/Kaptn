import { z } from "zod"

// Endpoints schema for data table
export const endpointsSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	age: z.string(),
	subsets: z.number(),
	totalAddresses: z.number(),
	totalPorts: z.number(),
	addresses: z.array(z.string()),
	ports: z.array(z.string()),
	addressesDisplay: z.string(),
	portsDisplay: z.string(),
	creationTimestamp: z.string().transform((val) => new Date(val)),
	labels: z.record(z.string()).optional(),
	annotations: z.record(z.string()).optional(),
})

export type EndpointsType = z.infer<typeof endpointsSchema>
