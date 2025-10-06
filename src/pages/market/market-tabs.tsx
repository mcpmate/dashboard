import { Plus, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import type { MarketTabsProps } from "./types";

export function MarketTabs({
	tabs,
	activeTab,
	onTabChange,
	onCloseTab,
	onAddTab,
}: MarketTabsProps) {
	return (
		<div className="mt-4">
			<div className="flex items-center border-b border-slate-200 dark:border-slate-700">
				{/* Tab triggers */}
				<div className="flex items-center">
					{tabs.map((tab, index) => (
						<div key={tab.id} className="flex items-center group">
							<button
								type="button"
								onClick={() => onTabChange(tab.id)}
								className={`py-2 text-sm font-medium border-b-2 transition-colors ${
									index === 0 ? "pl-0 pr-4" : "px-4"
								} ${
									activeTab === tab.id
										? "border-primary text-primary"
										: "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
								}`}
							>
								<span className="flex items-center gap-2">
									{tab.icon ? (
										<img
											src={tab.icon}
											alt=""
											aria-hidden="true"
											className="h-4 w-4 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
											loading="lazy"
											draggable={false}
										/>
									) : null}
									<span>{tab.label}</span>
								</span>
							</button>
							{tab.closable && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onCloseTab(tab.id);
									}}
									className="ml-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>
					))}
				</div>

				{/* Add tab button */}
				<div className="ml-4">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
								<Plus className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuItem
								onClick={() => onAddTab("Official MCP Registry")}
							>
								Official MCP Registry
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									onAddTab("MCP Market", {
										id: "mcpmarket",
										url: "/market-proxy/",
										icon: "https://mcpmate.io/logo.svg",
									})
								}
							>
								MCP Market
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}
