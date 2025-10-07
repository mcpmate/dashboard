import { ArrowLeft, MessageSquare, Moon, Sun } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../lib/store";
import { NotificationCenter } from "../notification-center";

const FEEDBACK_EMAIL = "info@mcpmate.io";
const FEEDBACK_SUBJECT = encodeURIComponent("MCPMate preview feedback");
const FEEDBACK_BODY = encodeURIComponent(
	"Hi MCPMate team,\n\nDescribe your feedback here:\n\n— Sent from MCPMate preview\n",
);
const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${FEEDBACK_SUBJECT}&body=${FEEDBACK_BODY}`;

const ROUTE_TITLES: Record<string, string> = {
	"/": "Dashboard",
	"/profiles": "Profiles",
	"/clients": "Clients",
	"/market": "Market",
	"/servers": "Servers",
	"/runtime": "Runtime",
	"/system": "System",
	"/settings": "Settings",
};

const MAIN_ROUTES = [
	"/",
	"/profiles",
	"/clients",
	"/market",
	"/servers",
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
				{/* Left side: Sidebar toggle + Page title/Back button */}
				<div className="flex items-center gap-3">
					{/* Page title or Back button */}
					{isMainRoute ? (
						<h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
							{pageTitle}
						</h1>
					) : (
						<button
							type="button"
							onClick={handleBack}
							className="flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
							Back
						</button>
					)}
				</div>

				{/* Right side: Theme toggle + Notification center */}
				<div className="flex items-center space-x-4">
					<a
						href={FEEDBACK_MAILTO}
						className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
						aria-label="Send feedback via email"
					>
						<MessageSquare size={20} />
					</a>
					{/* Theme toggle button */}
					<button
						type="button"
						onClick={toggleTheme}
						aria-label="Toggle theme"
						className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
					>
						{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
					</button>

					{/* Notification center */}
					<NotificationCenter />
				</div>
			</div>
		</header>
	);
}
