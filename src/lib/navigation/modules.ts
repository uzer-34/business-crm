import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  Car,
  CheckSquare,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { tracksVehicles } from "@/lib/industry/registry";
import type { TermKey } from "@/lib/industry/terminology";

/*
 * Module Registry.
 *
 * One entry per navigable capability. A module is visible only when it is
 * enabled for the organization AND the member holds at least one of its
 * permissions. This is the single place navigation is declared — the shell
 * renders whatever this produces, so adding a future module (Leads, Job Cards,
 * Appointments) means adding a row here, not editing the layout.
 *
 * Visibility here is UX only. Every route and server action still performs its
 * own authorization; hiding a link is never a security control.
 */

export type ModuleKey =
  | "dashboard"
  | "customers"
  | "tasks"
  | "orders"
  | "invoices"
  | "payments"
  | "expenses"
  | "products"
  | "services"
  | "categories"
  | "inventory"
  | "suppliers"
  | "purchase-orders"
  | "vehicles"
  | "reports"
  | "employees"
  | "roles"
  | "branches"
  | "audit-log"
  | "settings";

export type NavGroupKey =
  | "overview"
  | "relationships"
  | "sales"
  | "catalog"
  | "operations"
  | "analytics"
  | "management"
  | "system";

export interface ModuleDefinition {
  key: ModuleKey;
  /** Static label. Modules whose noun changes by industry use `termKey` instead. */
  label: string;
  termKey?: TermKey;
  href: string;
  icon: LucideIcon;
  group: NavGroupKey;
  /** Visible when the member holds ANY of these. Empty means always visible. */
  permissions: PermissionKey[];
  /**
   * Industry/opt-in gating. Absent means the module is enabled for every
   * organization. Milestone 3's Industry Package Engine will replace these
   * predicates with materialized per-org module rows.
   */
  isEnabled?: (context: { industryKey: string }) => boolean;
}

export const MODULES: readonly ModuleDefinition[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "overview", permissions: [] },

  {
    key: "customers",
    label: "Customers",
    termKey: "customers",
    href: "/customers",
    icon: Users,
    group: "relationships",
    permissions: ["customers.view"],
  },
  {
    key: "vehicles",
    label: "Vehicles",
    href: "/vehicles",
    icon: Car,
    group: "relationships",
    permissions: ["vehicles.view"],
    isEnabled: ({ industryKey }) => tracksVehicles(industryKey),
  },

  {
    key: "orders",
    label: "Orders",
    termKey: "orders",
    href: "/orders",
    icon: ShoppingCart,
    group: "sales",
    permissions: ["sales.view"],
  },
  { key: "invoices", label: "Invoices", href: "/invoices", icon: FileText, group: "sales", permissions: ["invoices.view"] },
  {
    key: "payments",
    label: "Payments",
    href: "/invoices?paymentStatus=UNPAID",
    icon: Banknote,
    group: "sales",
    permissions: ["payments.record"],
  },

  { key: "products", label: "Products", href: "/products", icon: Package, group: "catalog", permissions: ["products.view"] },
  { key: "services", label: "Services", href: "/services", icon: Wrench, group: "catalog", permissions: ["services.view"] },
  {
    key: "categories",
    label: "Categories",
    href: "/categories",
    icon: FolderTree,
    group: "catalog",
    permissions: ["products.view", "services.view"],
  },

  { key: "inventory", label: "Inventory", href: "/inventory", icon: Boxes, group: "operations", permissions: ["inventory.view"] },
  { key: "suppliers", label: "Suppliers", href: "/suppliers", icon: Truck, group: "operations", permissions: ["suppliers.view"] },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    href: "/purchase-orders",
    icon: Receipt,
    group: "operations",
    permissions: ["purchases.view"],
  },
  { key: "expenses", label: "Expenses", href: "/expenses", icon: Banknote, group: "operations", permissions: ["expenses.view"] },
  { key: "tasks", label: "Tasks", href: "/tasks", icon: CheckSquare, group: "operations", permissions: ["tasks.view"] },

  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    group: "analytics",
    permissions: ["reports.sales", "reports.financial"],
  },

  { key: "employees", label: "Employees", href: "/employees", icon: UserCog, group: "management", permissions: ["employees.view"] },
  { key: "roles", label: "Roles", href: "/roles", icon: ShieldCheck, group: "management", permissions: ["roles.manage"] },
  { key: "branches", label: "Branches", href: "/branches", icon: Building2, group: "management", permissions: ["branches.view"] },

  {
    key: "audit-log",
    label: "Audit Log",
    href: "/audit-log",
    icon: ScrollText,
    group: "system",
    permissions: ["organization.manage"],
  },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, group: "system", permissions: [] },
] as const;

export const NAV_GROUPS: readonly { key: NavGroupKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "relationships", label: "Relationships" },
  { key: "sales", label: "Sales" },
  { key: "catalog", label: "Catalog" },
  { key: "operations", label: "Operations" },
  { key: "analytics", label: "Analytics" },
  { key: "management", label: "Management" },
  { key: "system", label: "System" },
] as const;
