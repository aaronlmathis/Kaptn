import * as React from "react"
import { SiKubernetes } from "react-icons/si"

type AppLogoProps = {
  className?: string
}

export const AppLogo: React.FC<AppLogoProps> = ({ className }) => {
  return (
    // IMPORTANT: do NOT add extra px here; SidebarHeader already has p-2
    <div className="flex items-center">
      <a href="/" className={`flex items-center hover:opacity-80 transition-opacity ${className ?? ""}`}>
        {/* Icon cell must match your nav buttons (typically size-9 + mx-1) */}
        <div className="mx-1 flex size-9 shrink-0 items-center justify-center rounded-md">
          {/* Icon size should match nav icons (usually size-5 or size-6) */}
          <SiKubernetes className="size-6 text-primary" />
        </div>

        {/* Wordmark collapses; icon cell never moves */}
        <div
          className="
            ml-2 max-w-[14rem] overflow-hidden
            transition-[max-width,opacity,margin] duration-200 ease-in-out
            group-data-[state=collapsed]:max-w-0
            group-data-[state=collapsed]:opacity-0
            group-data-[state=collapsed]:ml-0
          "
        >
          <span className="text-[1.75rem] leading-none font-bold text-gray-900 dark:text-white">Kaptn</span>
          <span className="text-[1rem] leading-none font-normal text-primary">.dev</span>
        </div>
      </a>
    </div>
  )
}
