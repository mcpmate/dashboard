import { ArrowLeft, BellRing, Moon, Sun } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../lib/store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const ROUTE_TITLES: Record<string, string> = {
	"/": "Dashboard",
	"/config": "Config Suits",
	"/servers": "Servers",
	"/tools": "Tools",
	"/runtime": "Runtime",
	"/system": "System",
	"/settings": "Settings",
};

const MAIN_ROUTES = [
	"/",
	"/config",
	"/servers",
	"/tools",
	"/runtime",
	"/system",
	"/settings",
];

export function Header() {
	const location = useLocation();
	const navigate = useNavigate();
	const { theme, setTheme, sidebarOpen } = useAppStore();

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
	};

	const isMainRoute = MAIN_ROUTES.includes(location.pathname);
	const pageTitle = ROUTE_TITLES[location.pathname];

	const handleBack = () => {
		navigate(-1);
	};

	return (
		<header
			className={`fixed top-0 right-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950 ${
				sidebarOpen ? "left-64" : "left-16"
			} transition-all duration-300 ease-in-out`}
		>
			<div className="flex w-full items-center justify-between">
				{isMainRoute ? (
					<h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
						{pageTitle}
					</h1>
				) : (
					<Button
						variant="ghost"
						size="sm"
						onClick={handleBack}
						className="text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				)}

				<div className="flex items-center space-x-4">
					<div className="flex items-center">
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleTheme}
							aria-label="Toggle theme"
						>
							{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
						</Button>
					</div>

					<div className="flex items-center">
						<Button variant="ghost" size="icon" aria-label="Notifications">
							<div className="relative">
								<BellRing size={20} />
								<Badge
									className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center"
									variant="destructive"
								>
									2
								</Badge>
							</div>
						</Button>
					</div>
				</div>
			</div>
		</header>
	);
}
