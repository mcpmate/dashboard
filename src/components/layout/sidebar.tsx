import {
	Activity,
	AppWindow,
	Bug,
	ChevronLeft,
	ChevronRight,
	LayoutDashboard,
	Server,
	Settings,
	Sliders,
	Store,
} from "lucide-react";
import type React from "react";
import { NavLink } from "react-router-dom";
import { useAppStore } from "../../lib/store";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface SidebarLinkProps {
	to: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}

interface ExternalSidebarLinkProps {
	href: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}

function SidebarLink({ to, icon, children }: SidebarLinkProps) {
	return (
		<NavLink
			to={to}
			className={({ isActive }) =>
				cn(
					"flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
					"hover:bg-slate-200 dark:hover:bg-slate-800",
					isActive
						? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
						: "text-slate-700 dark:text-slate-400",
				)
			}
		>
			<span className="mr-3 h-5 w-5">{icon}</span>
			<span>{children}</span>
		</NavLink>
	);
}

function ExternalSidebarLink({
	href,
	icon,
	children,
}: ExternalSidebarLinkProps) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				"flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
				"hover:bg-slate-200 dark:hover:bg-slate-800",
				"text-slate-700 dark:text-slate-400",
			)}
		>
			<span className="mr-3 h-5 w-5">{icon}</span>
			<span>{children}</span>
		</a>
	);
}

export function Sidebar() {
	const sidebarOpen = useAppStore((state) => state.sidebarOpen);
	const toggleSidebar = useAppStore((state) => state.toggleSidebar);
	const showApiDocsMenu = useAppStore(
		(state) => state.dashboardSettings.showApiDocsMenu,
	);

	return (
		<div
			className={cn(
				"fixed inset-y-0 left-0 z-40 flex flex-col transition-all duration-300 ease-in-out",
				"border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
				sidebarOpen ? "w-64" : "w-16",
			)}
		>
			<div className="flex h-16 items-center justify-between px-4">
				<div
					className={cn(
						"flex items-center gap-2",
						sidebarOpen ? "justify-between w-full" : "justify-center",
					)}
				>
					{/* Brand: show logo + title when expanded; only logo when collapsed */}
					<img
						src="https://mcpmate.io/logo.svg"
						alt="MCPMate"
						className={cn(
							"h-6 w-6 object-contain transition",
							"dark:invert dark:brightness-0",
							!sidebarOpen && "mx-auto",
						)}
					/>
					{sidebarOpen && (
						<span className="font-bold text-xl dark:text-white">MCPMate</span>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleSidebar}
						className="ml-auto"
						aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
					>
						{sidebarOpen ? (
							<ChevronLeft size={18} />
						) : (
							<ChevronRight size={18} />
						)}
					</Button>
				</div>
			</div>

			<div className="flex flex-col flex-1 gap-1 px-2 py-4">
				<div className={cn("flex", !sidebarOpen && "justify-center")}>
					{sidebarOpen ? (
						<span className="px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
							MAIN
						</span>
					) : null}
				</div>

				<SidebarLink to="/" icon={<LayoutDashboard size={20} />}>
					{sidebarOpen && "Dashboard"}
				</SidebarLink>

				<SidebarLink to="/profiles" icon={<Sliders size={20} />}>
					{sidebarOpen && "Profiles"}
				</SidebarLink>

				<SidebarLink to="/clients" icon={<AppWindow size={20} />}>
					{sidebarOpen && "Clients"}
				</SidebarLink>

				<SidebarLink to="/servers" icon={<Server size={20} />}>
					{sidebarOpen && "Servers"}
				</SidebarLink>

				<SidebarLink to="/market" icon={<Store size={20} />}>
					{sidebarOpen && "Market"}
				</SidebarLink>

				{/* Tools removed per feedback */}

				<SidebarLink to="/runtime" icon={<Activity size={20} />}>
					{sidebarOpen && "Runtime"}
				</SidebarLink>

				<div className="mt-auto">
					{showApiDocsMenu && (
						<ExternalSidebarLink
							href="http://127.0.0.1:8080/docs"
							icon={<Bug size={20} />}
						>
							{sidebarOpen && "API Docs"}
						</ExternalSidebarLink>
					)}

					<SidebarLink to="/settings" icon={<Settings size={20} />}>
						{sidebarOpen && "Settings"}
					</SidebarLink>
				</div>
			</div>
		</div>
	);
}
