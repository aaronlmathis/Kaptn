"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export interface MultiSelectOption {
	value: string;
	label: string;
}

interface MultiSelectComboboxProps {
	options: MultiSelectOption[];
	values: string[];
	onValuesChange: (values: string[]) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	emptyText?: string;
	disabled?: boolean;
	className?: string;
	maxSelections?: number;
}

export function MultiSelectCombobox({
	options,
	values = [],
	onValuesChange,
	placeholder = "Select options...",
	searchPlaceholder = "Search...",
	emptyText = "No options found.",
	disabled = false,
	className,
	maxSelections,
}: MultiSelectComboboxProps) {
	const [open, setOpen] = React.useState(false)

	const selectedOptions = options.filter((option) => values.includes(option.value))

	const handleSelect = (optionValue: string) => {
		const newValues = values.includes(optionValue)
			? values.filter((value) => value !== optionValue)
			: maxSelections && values.length >= maxSelections
				? values
				: [...values, optionValue]

		onValuesChange(newValues)
	}

	const handleRemove = (valueToRemove: string) => {
		onValuesChange(values.filter((value) => value !== valueToRemove))
	}

	const displayText = selectedOptions.length === 0
		? placeholder
		: `${selectedOptions.length} selected`

	return (
		<div className="w-full">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className={cn("w-full justify-between", className)}
						disabled={disabled}
					>
						{displayText}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-full p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
					<Command>
						<CommandInput placeholder={searchPlaceholder} />
						<CommandList>
							<CommandEmpty>{emptyText}</CommandEmpty>
							<CommandGroup>
								{options.map((option) => (
									<CommandItem
										key={option.value}
										value={option.value}
										onSelect={() => handleSelect(option.value)}
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4",
												values.includes(option.value) ? "opacity-100" : "opacity-0"
											)}
										/>
										{option.label}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{selectedOptions.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-2">
					{selectedOptions.map((option) => (
						<Badge
							key={option.value}
							variant="secondary"
							className="gap-1"
						>
							{option.label}
							<X
								className="h-3 w-3 cursor-pointer"
								onClick={() => handleRemove(option.value)}
							/>
						</Badge>
					))}
				</div>
			)}
		</div>
	)
}
