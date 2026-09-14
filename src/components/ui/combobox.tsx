"use client";

import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./menu";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra searchable text (e.g. a currency's country) that isn't in the label. */
  keywords?: string;
  hint?: string;
}

/**
 * Searchable single-select. Used wherever the option list is too long to scan
 * in a native select (countries, currencies, locales, timezones, categories).
 * Renders a real hidden input so it works inside plain <form> submissions and
 * server actions without extra client state plumbing.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  name,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  id,
  disabled,
  invalid,
  describedBy,
  className,
}: {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/*
            A button opening a popover: aria-required/aria-invalid are not
            valid on the button role, so required and error state reach screen
            readers through the FormField label and the aria-describedby error
            text instead, and through the border treatment visually.
          */}
          <button
            type="button"
            id={id}
            aria-expanded={open}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm transition-colors",
              "hover:border-border-strong disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60",
              invalid && "border-danger ring-1 ring-danger",
              className,
            )}
          >
            <span className={cn("truncate", !selected && "text-foreground-subtle")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[12rem]">
          <Command
            filter={(itemValue, search, keywords) => {
              const haystack = `${itemValue} ${keywords?.join(" ") ?? ""}`.toLowerCase();
              return haystack.includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
              <Command.Input
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
              />
            </div>
            <Command.List className="max-h-60 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-foreground-muted">
                {emptyMessage}
              </Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.label}
                  keywords={[option.value, option.keywords ?? ""]}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] data-[selected=true]:bg-hover"
                >
                  <Check
                    className={cn("size-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && <span className="shrink-0 text-[12px] text-foreground-subtle">{option.hint}</span>}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
