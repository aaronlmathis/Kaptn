import { z } from "zod"

// PersistentVolumeClaim schema
export const persistentVolumeClaimSchema = z.object({
	id: z.string(),
	name: z.string(),
	namespace: z.string(),
	status: z.string(),
	volume: z.string(),
	capacity: z.string(),
	accessModes: z.array(z.string()),
	accessModesDisplay: z.string(),
	storageClass: z.string(),
	age: z.string(),
	labelsCount: z.number(),
	annotationsCount: z.number(),
})
