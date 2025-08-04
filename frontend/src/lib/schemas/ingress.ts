import { z } from "zod"

// Ingress schema for the data table
export const ingressSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	age: z.string(),
	ingressClass: z.string(),
	hosts: z.array(z.string()),
	hostsDisplay: z.string(),
	paths: z.array(z.string()),
	externalIPs: z.array(z.string()),
	externalIPsDisplay: z.string(),
})

export type IngressTableRow = z.infer<typeof ingressSchema>
