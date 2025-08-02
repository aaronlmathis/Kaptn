import { cva as classCva } from "class-variance-authority"

// Re-export cva
export const cva = classCva

// Create a custom VariantProps type based on the cva function
export type VariantProps<T extends (...args: any) => any> = Parameters<T>[0]
