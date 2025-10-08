"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "../../lib/utils";

function cleanupBodyLocks() {
	try {
		// Remove body styles/attributes that can block interaction
		document.body.style.removeProperty("pointer-events");
		document.body.style.removeProperty("overflow");
		document.body.style.removeProperty("padding-right");
		document.body.removeAttribute("data-scroll-locked");
		document.body.removeAttribute("aria-hidden");
		document.documentElement?.removeAttribute("aria-hidden");
		setAppInert(false);

		// Remove pointer-events from all overlays when no drawers are open
		// to ensure they can respond to clicks properly
		const overlays = document.querySelectorAll<HTMLElement>(
			"[data-vaul-overlay], [data-vaul-drawer-wrapper], [data-radix-dialog-overlay], [data-radix-popper-content-wrapper]",
		);
		overlays.forEach((overlay) => {
			// Always remove pointer-events style to let the overlay work naturally
			overlay.style.removeProperty("pointer-events");
		});
	} catch {
		/* noop */
	}
}

function hasAnyOpenLayer() {
	try {
		return !!document.querySelector(
			'[data-state="open"][data-vaul-overlay], [data-state="open"][data-vaul-drawer], [data-state="open"][data-radix-dialog-overlay], [data-state="open"][role="dialog"]',
		);
	} catch {
		return false;
	}
}

function ensureBodyInteractive() {
	try {
		if (!hasAnyOpenLayer()) {
			document.body.style.removeProperty("pointer-events");
			document.documentElement?.style?.removeProperty?.("pointer-events");
			setAppInert(false);
		}
	} catch {
		/* noop */
	}
}

function setAppInert(inert: boolean) {
	try {
		const root =
			document.getElementById("root") ?? document.querySelector("#root");
		if (!root) return;
		if (inert) {
			root.setAttribute("data-app-inert", "true");
			root.setAttribute("inert", "");
			root.removeAttribute("aria-hidden");
		} else {
			root.removeAttribute("data-app-inert");
			root.removeAttribute("inert");
			root.removeAttribute("aria-hidden");
		}
	} catch {
		/* noop */
	}
}

// Create a context to share the close handler with DrawerOverlay
const DrawerContext = React.createContext<{
	onClose?: () => void;
}>({});

const Drawer = ({
	shouldScaleBackground = false,
	direction = "right",
	onOpenChange,
	...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & {
	direction?: "right" | "left" | "top" | "bottom";
}) => {
	const handleOpenChange = React.useCallback(
		(open: boolean) => {
			try {
				onOpenChange?.(open);
			} catch {
				/* noop */
			}
			if (open) {
				setAppInert(true);
			}
			if (!open) {
				// Defer cleanup to after transition completes
				requestAnimationFrame(() =>
					setTimeout(() => {
						cleanupBodyLocks();
						ensureBodyInteractive();
					}, 80),
				);
			}
		},
		[onOpenChange],
	);

	const handleClose = React.useCallback(() => {
		handleOpenChange(false);
	}, [handleOpenChange]);

	// Install global guard (once) to keep body interactive if styles linger
	React.useEffect(() => {
		const w = window as unknown as { __mcpDrawerGuardInstalled?: boolean };
		if (!w.__mcpDrawerGuardInstalled) {
			try {
				const mo = new MutationObserver(() => ensureBodyInteractive());
				mo.observe(document.body, {
					attributes: true,
					attributeFilter: ["style"],
				});
				window.addEventListener("pointerdown", ensureBodyInteractive, true);
				window.addEventListener("keydown", ensureBodyInteractive, true);
				window.addEventListener("resize", ensureBodyInteractive);
				document.addEventListener("visibilitychange", ensureBodyInteractive);
				// mark installed
				(w as any).__mcpDrawerGuardInstalled = true;
				// store cleanup on window to avoid double attaching
				(window as any).__mcpDrawerGuardCleanup = () => {
					try {
						mo.disconnect();
						window.removeEventListener(
							"pointerdown",
							ensureBodyInteractive,
							true,
						);
						window.removeEventListener("keydown", ensureBodyInteractive, true);
						window.removeEventListener("resize", ensureBodyInteractive);
						document.removeEventListener(
							"visibilitychange",
							ensureBodyInteractive,
						);
					} catch {
						/* noop */
					}
				};
			} catch {
				/* noop */
			}
		}
		return () => {
			/* no-op, keep single global guard */
		};
	}, []);

	// Safety net: cleanup when component unmounts (e.g. route change while open)
	React.useEffect(
		() => () => {
			cleanupBodyLocks();
			ensureBodyInteractive();
			setAppInert(false);
		},
		[],
	);

	return (
		<DrawerContext.Provider value={{ onClose: handleClose }}>
			<DrawerPrimitive.Root
				shouldScaleBackground={shouldScaleBackground}
				direction={direction}
				onOpenChange={handleOpenChange}
				dismissible={false}
				modal={true}
				{...props}
			/>
		</DrawerContext.Provider>
	);
};
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
	React.ElementRef<typeof DrawerPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, onClick, ...props }, ref) => {
	const { onClose } = React.useContext(DrawerContext);

	const handleClick = React.useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			// Call original onClick if provided
			onClick?.(e);
			// Close the drawer when clicking the overlay
			if (e.target === e.currentTarget && onClose) {
				onClose();
			}
		},
		[onClick, onClose],
	);

	return (
		<DrawerPrimitive.Overlay
			ref={ref}
			className={cn("fixed inset-0 z-50 bg-black/80", className)}
			onClick={handleClick}
			{...props}
		/>
	);
});
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
	React.ElementRef<typeof DrawerPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => {
	return (
		<DrawerPortal>
			<DrawerOverlay />
			<DrawerPrimitive.Content
				ref={ref}
				className={cn(
					"fixed top-0 right-0 bottom-0 z-50 h-screen w-full sm:w-[560px] md:w-[720px] flex flex-col border-l border-slate-200 dark:border-slate-700 bg-background shadow-lg overflow-y-auto",
					className,
				)}
				{...props}
			>
				{children}
			</DrawerPrimitive.Content>
		</DrawerPortal>
	);
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
		{...props}
	/>
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("mt-auto flex flex-col gap-2 p-4", className)}
		{...props}
	/>
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
	React.ElementRef<typeof DrawerPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DrawerPrimitive.Title
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
	React.ElementRef<typeof DrawerPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DrawerPrimitive.Description
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
	Drawer,
	DrawerPortal,
	DrawerOverlay,
	DrawerTrigger,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerFooter,
	DrawerTitle,
	DrawerDescription,
};
