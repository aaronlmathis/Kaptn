import { z } from "zod"

export const configMapSchema = z.object({
	id: z.string(),
	name: z.string(),
	namespace: z.string(),
	age: z.string(),
	dataKeysCount: z.number(),
	dataSize: z.string(),
	dataSizeBytes: z.number(),
	dataKeys: z.array(z.string()),
	labelsCount: z.number(),
	annotationsCount: z.number(),
	creationTimestamp: z.date(),
	labels: z.record(z.string()).nullable(),
	annotations: z.record(z.string()).nullable(),
})

export type ConfigMap = z.infer<typeof configMapSchema>
