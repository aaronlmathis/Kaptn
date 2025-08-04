import { z } from "zod"

// CronJob schema
export const cronJobSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	schedule: z.string(),
	suspend: z.boolean(),
	active: z.number(),
	lastSchedule: z.string(),
	age: z.string(),
	image: z.string(),
})
