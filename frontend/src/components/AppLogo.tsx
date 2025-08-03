// src/components/AppLogo.tsx
import * as React from "react"
import { SiKubernetes } from "react-icons/si"

export interface AppLogoProps {
	href?: string
	className?: string
}

export const AppLogo: React.FC<AppLogoProps> = ({
	href = "/",
	className = "",
}) => (
	<div className={`flex items-center ${className}`}>
		<a
			href={href}
			className="flex items-center hover:opacity-80 transition-opacity"
		>
			<SiKubernetes className="h-8 w-8 text-brand-600 mr-2" />
			<span className="text-xl font-bold text-gray-900 dark:text-white">
				DeepThought
			</span>
			<span className="text-xl font-normal text-brand-600">.sh</span>
		</a>
	</div>
)