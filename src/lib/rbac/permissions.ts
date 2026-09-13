// The permission catalog is a code-level source of truth, seeded into the
// `permissions` table by prisma/seed.ts. Server-side mutations check these
// keys via requirePermission() (see ./guard.ts) — never a role name string.

export const PERMISSION_CATALOG = [
  // Organization & branches
  { key: "organization.manage", category: "Organization", description: "Edit organization settings" },
  { key: "branches.view", category: "Organization", description: "View branches" },
  { key: "branches.manage", category: "Organization", description: "Create, edit, archive branches" },

  // Employees & roles
  { key: "employees.view", category: "Employees", description: "View employees and their roles" },
  { key: "employees.manage", category: "Employees", description: "Invite, remove, or reassign employees" },
  { key: "roles.manage", category: "Employees", description: "Create custom roles and edit permissions" },

  // Customers
  { key: "customers.view", category: "Customers", description: "View customers" },
  { key: "customers.create", category: "Customers", description: "Create customers" },
  { key: "customers.edit", category: "Customers", description: "Edit customers" },
  { key: "customers.delete", category: "Customers", description: "Delete or archive customers" },
  { key: "customers.assign", category: "Customers", description: "Assign customers to employees" },

  // Reports
  { key: "reports.sales", category: "Reports", description: "View sales reports" },
  { key: "reports.financial", category: "Reports", description: "View financial reports" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

export const SYSTEM_ROLES = [
  {
    key: "owner",
    name: "Owner",
    allBranches: true,
    permissions: PERMISSION_CATALOG.map((p) => p.key) as PermissionKey[],
  },
  {
    key: "manager",
    name: "Manager",
    allBranches: true,
    permissions: [
      "branches.view",
      "employees.view",
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.assign",
      "reports.sales",
      "reports.financial",
    ] as PermissionKey[],
  },
  {
    key: "employee",
    name: "Employee",
    allBranches: false,
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
    ] as PermissionKey[],
  },
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];
