import { z } from 'zod'

// Zod schema for apply options form validation
export const applyOptionsSchema = z.object({
	namespace: z.string().optional(),
	dryRun: z.boolean(),
	force: z.boolean(),
	validate: z.boolean(),
	fieldManager: z.string().optional(),
	showDiff: z.boolean(),
	serverSide: z.boolean(),
})

export type ApplyOptionsFormData = z.infer<typeof applyOptionsSchema>

// Default values for the form
export const defaultApplyOptions: ApplyOptionsFormData = {
	namespace: undefined,
	dryRun: false,
	force: false,
	validate: true,
	fieldManager: undefined,
	showDiff: false,
	serverSide: false,
}

// Helper function to create form data with defaults
export function createApplyOptionsFormData(overrides: Partial<ApplyOptionsFormData> = {}): ApplyOptionsFormData {
	return {
		...defaultApplyOptions,
		...overrides,
	}
}
