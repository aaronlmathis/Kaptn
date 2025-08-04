// src/components/AppLogo.tsx
import * as React from "react"
import { SiKubernetes } from "react-icons/si"

export const AppLogo: React.FC = () => (
  <div
    className="
      flex items-center
      pr-4 py-3
      group-data-[state=collapsed]:px-0
      group-data-[state=collapsed]:justify-center
      transition-padding duration-200
    "
  >
    <a
      href="/"
      className="flex items-center hover:opacity-80 transition-opacity"
    >
      <SiKubernetes
        className="
          h-8 w-8
          text-primary
          group-data-[state=collapsed]:mx-auto
        "
      />

      <span
        className="
          ml-2
          text-xl font-bold text-gray-900 dark:text-white 
          transition-all duration-200 ease-in-out
          whitespace-nowrap overflow-hidden
          group-data-[state=collapsed]:w-0
          group-data-[state=collapsed]:opacity-0
        "
      >
        Kaptn
      </span>
      <span
        className="
          text-xl font-normal text-primary 
          transition-all duration-200 ease-in-out
          whitespace-nowrap overflow-hidden
          group-data-[state=collapsed]:w-0
          group-data-[state=collapsed]:opacity-0
        "
      >
        .dev
      </span>
    </a>
  </div>
)
