import React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../lib/utils";
import { LazyImage } from "./lazy-image";

const Avatar = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
	<AvatarPrimitive.Root
		ref={ref}
		className={cn(
			"relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full",
			className,
		)}
		{...props}
	/>
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Image>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
	<AvatarPrimitive.Image
		ref={ref}
		className={cn("aspect-square h-full w-full object-contain", className)}
		{...props}
	/>
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
	React.ElementRef<typeof AvatarPrimitive.Fallback>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
	<AvatarPrimitive.Fallback
		ref={ref}
		className={cn(
			"flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
			className,
		)}
		{...props}
	/>
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export interface CachedAvatarProps {
	src?: string;
	alt?: string;
	fallback: string;
	className?: string;
	size?: "sm" | "md" | "lg" | "xl";
	onLoad?: () => void;
	onError?: () => void;
	timeout?: number;
}

const sizeClasses = {
	sm: "h-6 w-6 text-xs",
	md: "h-8 w-8 text-sm",
	lg: "h-12 w-12 text-lg",
	xl: "h-16 w-16 text-xl",
};

export function CachedAvatar({
	src,
	alt = "",
	fallback,
	className,
	size = "md",
	onLoad,
	onError,
	timeout = 10000,
}: CachedAvatarProps) {
	const fallbackText = fallback.charAt(0).toUpperCase();

	return (
		<Avatar className={cn(sizeClasses[size], className)}>
			{src ? (
				<LazyImage
					src={src}
					alt={alt}
					cacheKey={`avatar-${src}`}
					timeout={timeout}
					onLoad={onLoad}
					onError={onError}
					fallback={
						<AvatarFallback className={sizeClasses[size]}>
							{fallbackText}
						</AvatarFallback>
					}
					placeholder={
						<div className="flex h-full w-full items-center justify-center">
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
						</div>
					}
					className="h-full w-full"
				/>
			) : (
				<AvatarFallback className={sizeClasses[size]}>
					{fallbackText}
				</AvatarFallback>
			)}
		</Avatar>
	);
}

// 导出原始组件以保持兼容性
export { Avatar, AvatarImage, AvatarFallback };
