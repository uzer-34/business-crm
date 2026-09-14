import type { LucideIcon } from "lucide-react";
import { Banknote, Car, CheckSquare, FileText, FolderTree, Package, Receipt, ShoppingCart, Truck, Users, Wrench } from "lucide-react";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { tracksVehicles } from "@/lib/industry/registry";
import { getTerminology, type TermKey } from "@/lib/industry/terminology";
import type { NavigationContext } from "./build";

/*
 * Global create registry.
 *
 * Every entry points at a route that already exists and can actually complete
 * the creation — a create action is never listed for a screen that cannot
 * perform it. Industry-specific actions gate through `isEnabled`, the same
 * mechanism the Module Registry uses, so the Industry Package Engine can later
 * contribute actions without changing the shell.
 */

export interface CreateAction {
  key: string;
  label: string;
  termKey?: TermKey;
  href: string;
  icon: LucideIcon;
  permission: PermissionKey;
  isEnabled?: (context: { industryKey: string }) => boolean;
}

/**
 * Several list screens open their create form from a dialog on the list page
 * itself rather than a dedicated /new route. `?new=1` is the shared convention
 * those pages read to auto-open that dialog on load.
 */
export const CREATE_ACTIONS: readonly CreateAction[] = [
  { key: "customer", label: "Customer", termKey: "customer", href: "/customers?new=1", icon: Users, permission: "customers.create" },
  { key: "order", label: "Order", termKey: "order", href: "/orders/new", icon: ShoppingCart, permission: "sales.create" },
  { key: "invoice", label: "Invoice", href: "/invoices?new=1", icon: FileText, permission: "invoices.create" },
  { key: "expense", label: "Expense", href: "/expenses?new=1", icon: Banknote, permission: "expenses.create" },
  { key: "product", label: "Product", href: "/products?new=1", icon: Package, permission: "products.create" },
  { key: "service", label: "Service", href: "/services?new=1", icon: Wrench, permission: "services.create" },
  { key: "category", label: "Category", href: "/categories?new=1", icon: FolderTree, permission: "products.create" },
  { key: "task", label: "Task", href: "/tasks?new=1", icon: CheckSquare, permission: "tasks.create" },
  {
    key: "vehicle",
    label: "Vehicle",
    href: "/vehicles?new=1",
    icon: Car,
    permission: "vehicles.create",
    isEnabled: ({ industryKey }) => tracksVehicles(industryKey),
  },
  { key: "supplier", label: "Supplier", href: "/suppliers?new=1", icon: Truck, permission: "suppliers.create" },
  { key: "purchase-order", label: "Purchase Order", href: "/purchase-orders/new", icon: Receipt, permission: "purchases.create" },
] as const;

export interface ResolvedCreateAction {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export function buildCreateActions(context: NavigationContext): ResolvedCreateAction[] {
  const term = getTerminology(context.industryKey);

  return CREATE_ACTIONS.filter(
    (action) =>
      context.permissions.has(action.permission) &&
      (action.isEnabled ? action.isEnabled({ industryKey: context.industryKey }) : true),
  ).map((action) => ({
    key: action.key,
    label: action.termKey ? term[action.termKey] : action.label,
    href: action.href,
    icon: action.icon,
  }));
}
