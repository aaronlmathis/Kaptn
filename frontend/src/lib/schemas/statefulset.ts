import { z } from "zod"

// StatefulSet schema
export const statefulSetSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	ready: z.string(),
	current: z.number(),
	updated: z.number(),
	age: z.string(),
	serviceName: z.string(),
	updateStrategy: z.string(),
})

export type StatefulSetTableRow = z.infer<typeof statefulSetSchema>
