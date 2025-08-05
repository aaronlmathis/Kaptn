import { z } from "zod"

// PersistentVolume schema
export const persistentVolumeSchema = z.object({
	id: z.string(),
	name: z.string(),
	capacity: z.string(),
	accessModes: z.array(z.string()),
	accessModesDisplay: z.string(),
	reclaimPolicy: z.string(),
	status: z.string(),
	claim: z.string(),
	storageClass: z.string(),
	volumeSource: z.string(),
	age: z.string(),
	labelsCount: z.number(),
	annotationsCount: z.number(),
})
