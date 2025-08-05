import { z } from "zod"

// Network Policy schema
export const networkPolicySchema = z.object({
	id: z.number(),
	name: z.string(),
	namespace: z.string(),
	age: z.string(),
	podSelector: z.string(),
	ingressRules: z.number(),
	egressRules: z.number(),
	policyTypes: z.string(),
	affectedPods: z.number(),
})
