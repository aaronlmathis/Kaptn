import { z } from "zod"

// VolumeSnapshotClass schema
export const volumeSnapshotClassSchema = z.object({
	id: z.string(),
	name: z.string(),
	driver: z.string(),
	deletionPolicy: z.string(),
	age: z.string(),
	labelsCount: z.number(),
	annotationsCount: z.number(),
	parametersCount: z.number(),
})
