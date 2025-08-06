import { z } from "zod"

// CSIDriver schema
export const csiDriverSchema = z.object({
	id: z.string(),
	name: z.string(),
	attachRequired: z.boolean(),
	podInfoOnMount: z.boolean(),
	requiresRepublish: z.boolean(),
	storageCapacity: z.boolean(),
	fsGroupPolicy: z.string(),
	volumeLifecycleModes: z.number(),
	tokenRequests: z.number(),
	age: z.string(),
	labelsCount: z.number(),
	annotationsCount: z.number(),
})
