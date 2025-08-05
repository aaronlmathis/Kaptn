import { z } from "zod"

export const loadBalancerSchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	type: z.string(),
	clusterIP: z.string(),
	externalIP: z.string(),
	ports: z.string(),
	age: z.string(),
	// Additional LoadBalancer-specific fields
	loadBalancerIP: z.string().optional(),
	ingressPoints: z.array(z.string()).optional(),
})

export type LoadBalancer = z.infer<typeof loadBalancerSchema>
