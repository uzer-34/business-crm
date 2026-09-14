import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:brightness-110 active:brightness-95",
  secondary: "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95",
  outline: "border border-border-strong bg-surface text-foreground hover:bg-hover",
  ghost: "text-foreground-muted hover:bg-hover hover:text-foreground",
  subtle: "bg-accent-subtle text-accent-subtle-foreground hover:brightness-95",
  danger: "bg-danger text-accent-foreground hover:brightness-110 active:brightness-95",
};

// Every size keeps a >=32px hit area; "sm" is only used inside rows that
// already provide padding around the control.
const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-9 w-9",
  "icon-sm": "h-8 w-8",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,filter,opacity] duration-150",
          "disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && !asChild ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps extends ButtonProps {
  /** Required: an icon alone is never self-describing to a screen reader. */
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "icon", variant = "ghost", ...props }, ref) => (
    <Button ref={ref} size={size} variant={variant} aria-label={label} title={label} {...props} />
  ),
);
IconButton.displayName = "IconButton";
