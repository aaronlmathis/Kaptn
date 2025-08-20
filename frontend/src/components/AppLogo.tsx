import * as React from "react";
import { SiKubernetes } from "react-icons/si";

type AppLogoProps = {
  className?: string;
};

export const AppLogo: React.FC<AppLogoProps> = ({ className }) => {
  return (
    <div className="flex items-center">
      <a
        href="/"
        className={`group flex items-center hover:opacity-80 transition-opacity ${className ?? ""}`}
      >
        {/* Icon cell (kept fixed so it doesn’t jump during collapse) */}
        <div className="ml-0 mr-[2px] flex size-8 shrink-0 items-center justify-center rounded-md">
          <SiKubernetes className="size-6 text-primary" />
        </div>

        {/* Wordmark block */}
        <div
          className="
            ml-0 -translate-x-[1px]   /* pull the K closer to the icon */
            max-w-[14rem] overflow-hidden select-none
            transition-[max-width,opacity,margin,transform] duration-200 ease-in-out
            group-data-[state=collapsed]:max-w-0
            group-data-[state=collapsed]:opacity-0
            group-data-[state=collapsed]:ml-0
            group-data-[state=collapsed]:-translate-x-0
          "
        >
          {/* Looser tracking so it doesn't look squished */}
          <span className="text-[1.75rem] leading-none font-bold tracking-[0.02em] text-gray-900 dark:text-white">
            Kaptn
          </span>
          {/* Slightly wider tracking for readability; align baseline with K */}
          <span className="relative top-[1px] text-[1rem] leading-none font-normal tracking-[0.08em] text-primary">
            .dev
          </span>
        </div>
      </a>
    </div>
  );
};
