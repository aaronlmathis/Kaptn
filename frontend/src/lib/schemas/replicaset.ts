import { z } from "zod"

// ReplicaSet schema
export const replicaSetSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	ready: z.string(), // Format like "2/3"
	desired: z.number(),
	current: z.number(),
	available: z.number(),
	age: z.string(),
})

export type ReplicaSetTableRow = z.infer<typeof replicaSetSchema>
