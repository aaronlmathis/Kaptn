import { z } from "zod"

// IngressClass schema for the data table
export const ingressClassSchema = z.object({
	id: z.number(),
	name: z.string(),
	age: z.string(),
	controller: z.string(),
	isDefault: z.boolean(),
	parametersKind: z.string().optional(),
	parametersName: z.string().optional(),
})

export type IngressClassTableRow = z.infer<typeof ingressClassSchema>
