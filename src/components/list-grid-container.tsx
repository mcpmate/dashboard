import type { ReactNode } from "react";
import { useAppStore } from "../lib/store";

export interface ListGridContainerProps {
	children: ReactNode;
	loading?: boolean;
	loadingSkeleton?: ReactNode;
	emptyState?: ReactNode;
	className?: string;
}

export function ListGridContainer({
	children,
	loading = false,
	loadingSkeleton,
	emptyState,
}: ListGridContainerProps) {
	const defaultView = useAppStore(
		(state) => state.dashboardSettings.defaultView,
	);

	if (loading) {
		return (
			<div
				className={
					defaultView === "grid"
						? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
						: "space-y-4"
				}
			>
				{loadingSkeleton}
			</div>
		);
	}

	if (emptyState) {
		return <div className="col-span-full">{emptyState}</div>;
	}

	return (
		<div
			className={
				defaultView === "grid"
					? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
					: "space-y-4"
			}
		>
			{children}
		</div>
	);
}

export interface EntityListItemProps {
	children: ReactNode;
	onClick?: () => void;
	onKeyDown?: (e: React.KeyboardEvent) => void;
	className?: string;
}

export function EntityListItem({
	children,
	onClick,
	onKeyDown,
	className = "",
}: EntityListItemProps) {
	return (
		<button
			type="button"
			className={`flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 cursor-pointer shadow-[0_4px_12px_-10px_rgba(15,23,42,0.2)] transition-shadow hover:border-primary/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_4px_12px_-10px_rgba(15,23,42,0.5)] ${className}`}
			onClick={onClick}
			onKeyDown={onKeyDown}
		>
			{children}
		</button>
	);
}

export interface EntityCardProps {
	children: ReactNode;
	onClick?: () => void;
	onKeyDown?: (e: React.KeyboardEvent) => void;
	className?: string;
}

export function EntityCard({
	children,
	onClick,
	onKeyDown,
	className = "",
}: EntityCardProps) {
	return (
		<button
			type="button"
			className={`group overflow-hidden cursor-pointer shadow-[0_4px_12px_-10px_rgba(15,23,42,0.2)] hover:border-primary/40 transition-shadow hover:shadow-lg dark:shadow-[0_4px_12px_-10px_rgba(15,23,42,0.5)] ${className}`}
			onClick={onClick}
			onKeyDown={onKeyDown}
		>
			{children}
		</button>
	);
}
