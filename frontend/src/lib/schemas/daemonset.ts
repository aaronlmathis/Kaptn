import { z } from "zod"

// DaemonSet schema
export const daemonSetSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	desired: z.number(),
	current: z.number(),
	ready: z.number(),
	available: z.number(),
	unavailable: z.number(),
	age: z.string(),
	updateStrategy: z.string(),
})
