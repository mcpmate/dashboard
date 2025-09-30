import {
	ArrowUp,
	ChevronLeft,
	ChevronRight,
	Grid3X3,
	List,
	Search,
} from "lucide-react";
import type React from "react";
import { cn } from "../../lib/utils";
import type { SearchField, SortOption } from "../../types/page-toolbar";
import { Button } from "./button";
import { Input } from "./input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

// 工具栏配置
export interface PageToolbarConfig {
	// 搜索配置
	search?: {
		placeholder?: string;
		fields?: SearchField[];
		debounceMs?: number;
	};

	// 视图模式配置
	viewMode?: {
		enabled?: boolean;
		defaultMode?: "grid" | "list";
	};

	// 排序配置
	sort?: {
		enabled?: boolean;
		options: SortOption[];
		defaultSort?: string;
	};

	// 布局配置
	layout?: "horizontal" | "vertical" | "responsive";
	className?: string;

	// 精简模式配置
	compact?: {
		enabled?: boolean;
		showExpandButton?: boolean;
	};
}

// 工具栏状态
export interface PageToolbarState {
	search: string;
	viewMode: "grid" | "list";
	sort: string;
	expanded?: boolean;
}

// 工具栏回调
export interface PageToolbarCallbacks {
	onSearchChange: (search: string) => void;
	onViewModeChange: (mode: "grid" | "list") => void;
	onSortChange: (sort: string) => void;
	onExpandedChange?: (expanded: boolean) => void;
}

// 工具栏属性
export interface PageToolbarProps {
	config: PageToolbarConfig;
	state: PageToolbarState;
	callbacks: PageToolbarCallbacks;
	actions?: React.ReactNode;
	className?: string;
}

export function PageToolbar({
	config,
	state,
	callbacks,
	actions,
	className,
}: PageToolbarProps) {
	const {
		search: searchConfig,
		viewMode: viewModeConfig,
		sort: sortConfig,
		compact: compactConfig,
	} = config;

	const { search, viewMode, sort, expanded = false } = state;

	const { onSearchChange, onViewModeChange, onSortChange, onExpandedChange } =
		callbacks;

	// 是否启用精简模式
	const isCompact = compactConfig?.enabled !== false;
	const isExpanded = expanded || !isCompact;

	// 渲染搜索框
	const renderSearch = () => {
		if (!searchConfig) return null;

		return (
			<div className="flex-1">
				<div className="flex items-center gap-2">
					{/* 展开/收起按钮 */}
					{isCompact && compactConfig?.showExpandButton !== false && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onExpandedChange?.(!expanded)}
							className="h-9 w-9 p-0 shrink-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
						>
							{expanded ? (
								<ChevronRight className="h-4 w-4" />
							) : (
								<ChevronLeft className="h-4 w-4" />
							)}
						</Button>
					)}

					{/* 搜索输入框 */}
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
						<Input
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							placeholder={searchConfig.placeholder || "Search..."}
							className="h-9 w-full rounded-md border border-slate-200 bg-white px-4 py-2 pl-10 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-400 dark:focus:ring-slate-600"
						/>
					</div>
				</div>
			</div>
		);
	};

	// 渲染视图切换
	const renderViewMode = () => {
		if (!viewModeConfig?.enabled || !isExpanded) return null;

		return (
			<div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 h-9">
				<Button
					variant={viewMode === "grid" ? "default" : "ghost"}
					size="sm"
					onClick={() => onViewModeChange("grid")}
					className="h-9 px-3"
				>
					<Grid3X3 className="h-4 w-4" />
				</Button>
				<Button
					variant={viewMode === "list" ? "default" : "ghost"}
					size="sm"
					onClick={() => onViewModeChange("list")}
					className="h-9 px-3"
				>
					<List className="h-4 w-4" />
				</Button>
			</div>
		);
	};

	// 渲染排序
	const renderSort = () => {
		if (!sortConfig?.enabled || !isExpanded) return null;

		return (
			<Select value={sort} onValueChange={onSortChange}>
				<SelectTrigger className="h-9 w-full sm:w-[200px]">
					<div className="flex items-center gap-2">
						<ArrowUp className="h-4 w-4 text-slate-500" />
						<SelectValue placeholder="Sort" />
					</div>
				</SelectTrigger>
				<SelectContent align="end">
					{sortConfig.options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	};

	return (
		<div className={cn("flex items-center gap-2", className)}>
			{/* 搜索框 */}
			{renderSearch()}

			{/* 控制按钮组 */}
			<div className="flex items-center gap-2">
				{/* 视图切换 */}
				{renderViewMode()}

				{/* 排序 */}
				{renderSort()}

				{/* 自定义操作 */}
				{actions}
			</div>
		</div>
	);
}

// 默认配置
export const defaultPageToolbarConfig: PageToolbarConfig = {
	search: {
		placeholder: "Search...",
		debounceMs: 300,
	},
	viewMode: {
		enabled: true,
		defaultMode: "grid",
	},
	sort: {
		enabled: true,
		options: [
			{ value: "name", label: "Name", direction: "asc" },
			{ value: "updated", label: "Recently updated", direction: "desc" },
		],
		defaultSort: "name",
	},
	layout: "responsive",
	compact: {
		enabled: true,
		showExpandButton: true,
	},
};

// 默认状态
export const defaultPageToolbarState: PageToolbarState = {
	search: "",
	viewMode: "grid",
	sort: "name",
	expanded: false,
};
