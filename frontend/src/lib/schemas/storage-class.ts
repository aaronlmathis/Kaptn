import { z } from "zod"

// StorageClass schema
export const storageClassSchema = z.object({
	id: z.string(),
	name: z.string(),
	provisioner: z.string(),
	reclaimPolicy: z.string(),
	volumeBindingMode: z.string(),
	allowVolumeExpansion: z.boolean(),
	parametersCount: z.number(),
	age: z.string(),
	labelsCount: z.number(),
	annotationsCount: z.number(),
	isDefault: z.boolean(),
})
