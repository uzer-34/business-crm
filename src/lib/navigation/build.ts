import type { LucideIcon } from "lucide-react";
import { Ellipsis, LayoutDashboard, ShoppingCart, CheckSquare, Users } from "lucide-react";
import { MODULES, NAV_GROUPS, type ModuleDefinition, type ModuleKey, type NavGroupKey } from "./modules";
import { getTerminology } from "@/lib/industry/terminology";

/*
 * Navigation Registry -> Module Registry -> Permission Check -> Visible Navigation.
 *
 * Pure functions with no database or React dependency so the rules are unit
 * testable and can run on the server during render without extra queries.
 */

export interface NavItem {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  items: NavItem[];
}

export interface NavigationContext {
  permissions: ReadonlySet<string>;
  industryKey: string;
}

function isModuleEnabled(module: ModuleDefinition, context: NavigationContext): boolean {
  return module.isEnabled ? module.isEnabled({ industryKey: context.industryKey }) : true;
}

/** A module with no declared permissions is open to every active member. */
function isModulePermitted(module: ModuleDefinition, context: NavigationContext): boolean {
  return module.permissions.length === 0 || module.permissions.some((key) => context.permissions.has(key));
}

export function getVisibleModules(context: NavigationContext): ModuleDefinition[] {
  return MODULES.filter((module) => isModuleEnabled(module, context) && isModulePermitted(module, context));
}

function labelFor(module: ModuleDefinition, context: NavigationContext): string {
  if (!module.termKey) return module.label;
  return getTerminology(context.industryKey)[module.termKey];
}

export function toNavItem(module: ModuleDefinition, context: NavigationContext): NavItem {
  return { key: module.key, label: labelFor(module, context), href: module.href, icon: module.icon };
}

/** Grouped navigation for the desktop sidebar and the mobile "More" drawer. */
export function buildNavigation(context: NavigationContext): NavGroup[] {
  const visible = getVisibleModules(context);

  return NAV_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: visible.filter((module) => module.group === group.key).map((module) => toNavItem(module, context)),
  })).filter((group) => group.items.length > 0);
}

/*
 * Mobile bottom navigation.
 *
 * Capped at five targets (four modules + "More") because a bottom bar past
 * five becomes untappable at 320px. A destination the member cannot access is
 * dropped rather than shown disabled, and "More" always remains to reach
 * everything else.
 */
const MOBILE_PRIMARY: readonly ModuleKey[] = ["dashboard", "customers", "orders", "tasks"];

export const MORE_NAV_ITEM = { key: "more" as const, label: "More", icon: Ellipsis as LucideIcon };

/** Fallback icons keep the bar stable if a module key is ever renamed. */
const MOBILE_FALLBACK_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  orders: ShoppingCart,
  tasks: CheckSquare,
};

export function buildMobilePrimaryNav(context: NavigationContext): NavItem[] {
  const visible = getVisibleModules(context);

  // Named `definition` rather than `module`: Next forbids assigning to a
  // variable called `module`, which collides with the CommonJS global.
  return MOBILE_PRIMARY.flatMap((key) => {
    const definition = visible.find((candidate) => candidate.key === key);
    if (!definition) return [];
    const item = toNavItem(definition, context);
    return [{ ...item, icon: item.icon ?? MOBILE_FALLBACK_ICONS[key] }];
  });
}

/**
 * Longest-prefix match so a detail route (/customers/abc) still highlights its
 * list entry, while "/" only ever matches itself.
 */
export function findActiveModuleKey(pathname: string, items: readonly NavItem[]): ModuleKey | null {
  let best: { key: ModuleKey; length: number } | null = null;

  for (const item of items) {
    const path = item.href.split("?")[0];
    const matches = pathname === path || pathname.startsWith(`${path}/`);
    if (matches && (!best || path.length > best.length)) {
      best = { key: item.key, length: path.length };
    }
  }

  return best?.key ?? null;
}
