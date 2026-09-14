"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/*
 * Form layer.
 *
 * FormField owns id generation and the label/description/error wiring
 * (htmlFor, aria-describedby, aria-invalid) so no screen has to repeat it, and
 * so the future Entity/Attribute Engine can render a field from metadata by
 * calling this component instead of emitting bespoke JSX per field.
 */

type FieldRenderProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  required: boolean | undefined;
};

export function FormField({
  label,
  description,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  description?: string;
  error?: string | null;
  required?: boolean;
  /** Supply when the control renders its own id (e.g. a native select). */
  htmlFor?: string;
  children: React.ReactNode | ((props: FieldRenderProps) => React.ReactNode);
  className?: string;
}) {
  const generatedId = React.useId();
  const id = htmlFor ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {description && (
        <p id={descriptionId} className="text-[12px] text-foreground-muted">
          {description}
        </p>
      )}
      {typeof children === "function"
        ? children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })
        : children}
      {error && (
        <p id={errorId} className="text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Groups related fields. Single column on mobile; `columns` applies from sm up. */
export function FormSection({
  title,
  description,
  columns = 1,
  children,
  className,
}: {
  title?: string;
  description?: string;
  columns?: 1 | 2;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {(title || description) && (
        <div>
          {title && <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>}
          {description && <p className="text-[12px] text-foreground-muted">{description}</p>}
        </div>
      )}
      <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2")}>{children}</div>
    </section>
  );
}

/**
 * Action row. Stacks full-width on mobile (with the primary action on top via
 * flex-col-reverse) and becomes a right-aligned row from sm up.
 */
export function FormActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto", className)}>
      {children}
    </div>
  );
}
