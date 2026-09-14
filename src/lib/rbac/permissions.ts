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

  // Catalog: Products & Services
  { key: "products.view", category: "Catalog", description: "View products" },
  { key: "products.create", category: "Catalog", description: "Create products" },
  { key: "products.edit", category: "Catalog", description: "Edit products and categories" },
  { key: "products.archive", category: "Catalog", description: "Archive products" },
  { key: "services.view", category: "Catalog", description: "View services" },
  { key: "services.create", category: "Catalog", description: "Create services" },
  { key: "services.edit", category: "Catalog", description: "Edit services and categories" },
  { key: "services.archive", category: "Catalog", description: "Archive services" },

  // Inventory
  { key: "inventory.view", category: "Inventory", description: "View stock levels and movement history" },
  { key: "inventory.adjust", category: "Inventory", description: "Record opening stock, adjustments, and damaged write-offs" },
  { key: "inventory.transfer", category: "Inventory", description: "Transfer stock between branches" },

  // Suppliers & Purchasing
  { key: "suppliers.view", category: "Purchasing", description: "View suppliers" },
  { key: "suppliers.create", category: "Purchasing", description: "Create suppliers" },
  { key: "suppliers.edit", category: "Purchasing", description: "Edit suppliers" },
  { key: "suppliers.archive", category: "Purchasing", description: "Archive suppliers" },
  { key: "purchases.view", category: "Purchasing", description: "View purchase orders" },
  { key: "purchases.create", category: "Purchasing", description: "Create purchase orders" },
  { key: "purchases.receive", category: "Purchasing", description: "Receive purchase order items and record payments" },
  { key: "purchases.cancel", category: "Purchasing", description: "Cancel purchase orders" },

  // Sales
  { key: "sales.view", category: "Sales", description: "View orders" },
  { key: "sales.create", category: "Sales", description: "Create orders" },
  { key: "sales.fulfill", category: "Sales", description: "Fulfill order items and record payments" },
  { key: "sales.cancel", category: "Sales", description: "Cancel orders" },

  // Invoices & Payments
  { key: "invoices.view", category: "Invoicing", description: "View invoices and payment history" },
  { key: "invoices.create", category: "Invoicing", description: "Generate invoices from orders" },
  { key: "invoices.void", category: "Invoicing", description: "Void invoices" },
  { key: "payments.record", category: "Invoicing", description: "Record payments against invoices" },

  // Expenses
  { key: "expenses.view", category: "Expenses", description: "View expenses" },
  { key: "expenses.create", category: "Expenses", description: "Record expenses" },
  { key: "expenses.void", category: "Expenses", description: "Void recorded expenses" },

  // Tasks (standalone, not tied to a customer — see customers.edit for
  // customer-scoped tasks, which predate this category)
  { key: "tasks.view", category: "Tasks", description: "View the team's task list" },
  { key: "tasks.create", category: "Tasks", description: "Create and assign standalone tasks" },
  { key: "tasks.edit", category: "Tasks", description: "Reassign or complete tasks assigned to others" },

  // Vehicles (Automobile Workshop industry pack)
  { key: "vehicles.view", category: "Vehicles", description: "View customer vehicles" },
  { key: "vehicles.create", category: "Vehicles", description: "Add vehicles to a customer" },
  { key: "vehicles.edit", category: "Vehicles", description: "Edit vehicle details" },
  { key: "vehicles.archive", category: "Vehicles", description: "Archive vehicles" },

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
      "products.view",
      "products.create",
      "products.edit",
      "services.view",
      "services.create",
      "services.edit",
      "inventory.view",
      "inventory.adjust",
      "inventory.transfer",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "purchases.view",
      "purchases.create",
      "purchases.receive",
      "sales.view",
      "sales.create",
      "sales.fulfill",
      "sales.cancel",
      "invoices.view",
      "invoices.create",
      "invoices.void",
      "payments.record",
      "expenses.view",
      "expenses.create",
      "expenses.void",
      "tasks.view",
      "tasks.create",
      "tasks.edit",
      "vehicles.view",
      "vehicles.create",
      "vehicles.edit",
      "vehicles.archive",
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
      "products.view",
      "services.view",
      "inventory.view",
      "suppliers.view",
      "purchases.view",
      // Unlike purchasing receipt (back-office), processing a sale is
      // frontline checkout work — employees need to create and fulfill
      // orders day-to-day, not just view them. Same reasoning extends to
      // invoicing/payments: a cashier prints the receipt and takes the
      // payment, but voiding an issued invoice is a back-office correction.
      "sales.view",
      "sales.create",
      "sales.fulfill",
      "invoices.view",
      "invoices.create",
      "payments.record",
      // Same reasoning as invoices.create: recording a day-to-day expense
      // (e.g. paying a delivery courier from petty cash) is frontline work;
      // voiding one after the fact is a back-office correction.
      "expenses.view",
      "expenses.create",
      // Employees can see and create their own team tasks day-to-day;
      // reassigning or completing someone *else's* task (tasks.edit) is a
      // supervisory action, same split as everywhere else in this catalog.
      // They can still always complete a task assigned to themselves —
      // that's enforced in code, not gated by a permission at all.
      "tasks.view",
      "tasks.create",
      // Logging a customer's vehicle and its details is frontline service-
      // desk work, same as creating the customer itself; archiving one is
      // a back-office correction, same split as everywhere else here.
      "vehicles.view",
      "vehicles.create",
      "vehicles.edit",
    ] as PermissionKey[],
  },
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];
