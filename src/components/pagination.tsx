import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface PaginationProps {
	/**
	 * Current page number (1-based)
	 */
	currentPage: number;
	/**
	 * Whether there is a previous page
	 */
	hasPreviousPage: boolean;
	/**
	 * Whether there is a next page
	 */
	hasNextPage: boolean;
	/**
	 * Whether pagination is in loading state
	 */
	isLoading?: boolean;
	/**
	 * Items per page
	 */
	itemsPerPage: number;
	/**
	 * Current page item count
	 */
	currentPageItemCount: number;
	/**
	 * Callback when previous page is clicked
	 */
	onPreviousPage: () => void;
	/**
	 * Callback when next page is clicked
	 */
	onNextPage: () => void;
	/**
	 * Additional CSS classes
	 */
	className?: string;
}

export function Pagination({
	currentPage,
	hasPreviousPage,
	hasNextPage,
	isLoading = false,
	itemsPerPage,
	currentPageItemCount,
	onPreviousPage,
	onNextPage,
	className,
}: PaginationProps) {
	const startItem = (currentPage - 1) * itemsPerPage + 1;
	const endItem = startItem + currentPageItemCount - 1;

	return (
		<div className={cn("flex items-center justify-between", className)}>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={onPreviousPage}
					disabled={!hasPreviousPage || isLoading}
					className="gap-1"
				>
					<ChevronLeft className="h-4 w-4" />
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={onNextPage}
					disabled={!hasNextPage || isLoading}
					className="gap-1"
				>
					Next
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
				<span>Page {currentPage}</span>
				{currentPageItemCount > 0 ? (
					<span>
						Showing {startItem}-{endItem} items
					</span>
				) : null}
			</div>
		</div>
	);
}
