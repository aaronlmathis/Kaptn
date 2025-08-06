import { z } from "zod"

// Node schema based on NodeTableRow interface
export const nodeSchema = z.object({
	id: z.number(),
	name: z.string(),
	status: z.string(),
	roles: z.string(),
	age: z.string(),
	version: z.string(),
})
