"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface LoadingBarProps {
  className?: string
  label?: string
  variant?: "default" | "thin" | "pulse"
}

export function LoadingBar({ 
  className, 
  label = "Loading...", 
  variant = "default" 
}: LoadingBarProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center space-y-4", className)}>
      {variant === "thin" && (
        <div className="w-full max-w-md">
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-loading-bar"></div>
          </div>
          {label && <p className="text-sm text-muted-foreground mt-2 text-center">{label}</p>}
        </div>
      )}
      
      {variant === "pulse" && (
        <div className="w-full max-w-md space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse"></div>
          <div className="h-4 bg-muted rounded animate-pulse w-3/4"></div>
          <div className="h-4 bg-muted rounded animate-pulse w-1/2"></div>
          {label && <p className="text-sm text-muted-foreground mt-2 text-center">{label}</p>}
        </div>
      )}
      
      {variant === "default" && (
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      )}
    </div>
  )
}
