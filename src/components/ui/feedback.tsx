import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-foreground-muted border-border",
  accent: "bg-accent-subtle text-accent-subtle-foreground border-transparent",
  success: "bg-success-subtle text-success border-transparent",
  warning: "bg-warning-subtle text-warning border-transparent",
  danger: "bg-danger-subtle text-danger border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

const alertTones: Record<Exclude<Tone, "neutral">, { className: string; Icon: LucideIcon }> = {
  accent: { className: "border-border bg-accent-subtle text-accent-subtle-foreground", Icon: Info },
  success: { className: "border-transparent bg-success-subtle text-success", Icon: CheckCircle2 },
  warning: { className: "border-transparent bg-warning-subtle text-warning", Icon: TriangleAlert },
  danger: { className: "border-transparent bg-danger-subtle text-danger", Icon: AlertCircle },
};

export function Alert({
  tone = "danger",
  title,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Exclude<Tone, "neutral">; title?: string }) {
  const { className: toneClass, Icon } = alertTones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", toneClass, className)}
      {...props}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-surface-sunken", className)} {...props} />;
}

/**
 * Empty states explain what is empty, why it matters, and the next action —
 * never just "No records". `icon` is decorative; the heading carries meaning.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-sunken">
          <Icon className="size-5 text-foreground-subtle" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-foreground-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <EmptyState icon={AlertCircle} title={title} description={description} action={action} />;
}
