import { type ClassValue, clsx } from "clsx";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names with Tailwind support
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Formats a number of bytes to a human-readable string
 */
export function formatBytes(bytes: number, decimals = 2) {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / k ** i).toFixed(dm)) + " " + sizes[i];
}

/**
 * Formats an uptime in seconds to a human-readable string
 */
export function formatUptime(seconds: number) {
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;

	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

/**
 * Formats a timestamp to a relative time
 */
export function formatRelativeTime(timestamp: string) {
	try {
		const date = new Date(timestamp);
		return formatDistance(date, new Date(), { addSuffix: true });
	} catch (error) {
		return "Invalid date";
	}
}

/**
 * Get a color variant based on status
 */
export function getStatusVariant(
	status: string,
): "success" | "warning" | "destructive" | "secondary" | "default" {
	const statusLower = status.toLowerCase();

	// Active/Ready states
	if (
		[
			"connected",
			"running",
			"healthy",
			"ready",
			"busy",
			"active",
			"enabled",
			"thinking",
			"fetch",
		].includes(statusLower)
	) {
		return "success";
	}

	// Warning/Initializing states
	if (
		[
			"disconnected",
			"initializing",
			"shutdown",
			"starting",
			"connecting",
			"pending",
			"disabled",
		].includes(statusLower)
	) {
		return "warning";
	}

	// Idle state - server is enabled but not running
	if (["idle"].includes(statusLower)) {
		return "secondary";
	}

	// Error states
	if (
		["error", "unhealthy", "stopped", "failed", "timeout"].includes(statusLower)
	) {
		return "destructive";
	}

	// Unknown or other states
	return "default";
}

/**
 * Formats a backup timestamp to a user-friendly local time format
 */
export function formatBackupTime(timestamp: string | null | undefined): string {
	if (!timestamp) return "-";

	try {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);

		// If less than 24 hours, show relative time
		if (diffHours < 24) {
			return formatDistance(date, now, { addSuffix: true });
		}

		// Otherwise show local date and time
		return date.toLocaleString(undefined, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	} catch (error) {
		return "Invalid date";
	}
}

/**
 * Truncate a string if it's too long
 */
export function truncate(str: string | undefined | null, length: number) {
	if (!str || typeof str !== "string") return "N/A";
	if (str.length <= length) return str;
	return `${str.slice(0, length)}...`;
}
