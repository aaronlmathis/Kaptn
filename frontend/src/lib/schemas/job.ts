import { z } from "zod"

export const jobSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	status: z.string(),
	completions: z.string(),
	duration: z.string(),
	age: z.string(),
	image: z.string(),
})

export type JobSchema = z.infer<typeof jobSchema>
