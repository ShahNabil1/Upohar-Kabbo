/** Shared RBAC model for admin-panel staff accounts. */

export type StaffModule = { key: string; label: string; section: string };

/** Every page a staff account can be granted. Keys are admin route paths. */
export const STAFF_MODULES: StaffModule[] = [
  { section: "Overview", key: "/admin", label: "Dashboard" },

  { section: "Catalog", key: "/admin/products", label: "Products" },
  { section: "Catalog", key: "/admin/sub-products", label: "Sub-Products" },
  { section: "Catalog", key: "/admin/combos", label: "Build Combo Box" },
  { section: "Catalog", key: "/admin/taxonomy", label: "Categories" },

  { section: "Orders", key: "/admin/orders/create", label: "Create Order" },
  { section: "Orders", key: "/admin/orders", label: "Web Orders" },
  { section: "Orders", key: "/admin/orders/list", label: "Order List" },
  { section: "Orders", key: "/admin/orders/search", label: "Search Orders" },

  { section: "Inventory", key: "/admin/inventory", label: "Inventory Dashboard" },
  { section: "Inventory", key: "/admin/inventory/alerts", label: "Stock Alerts" },
  { section: "Inventory", key: "/admin/inventory/purchase-orders", label: "Purchase Orders" },
  { section: "Inventory", key: "/admin/inventory/receive", label: "Add Inventory" },
  { section: "Inventory", key: "/admin/inventory/live", label: "Live Inventory" },
  { section: "Inventory", key: "/admin/inventory/combos", label: "Smart Combos" },
  { section: "Inventory", key: "/admin/inventory/rto", label: "RTO Inspection" },
  { section: "Inventory", key: "/admin/inventory/reconcile", label: "Reconciliation" },
  { section: "Inventory", key: "/admin/inventory/adjust", label: "Loss & Damage" },
  { section: "Inventory", key: "/admin/inventory/count", label: "Stock Audit" },
  { section: "Inventory", key: "/admin/inventory/reports", label: "Inventory Reports" },
  { section: "Inventory", key: "/admin/inventory/profit", label: "Profit & Loss" },
  { section: "Inventory", key: "/admin/inventory/closing", label: "Monthly Closing" },
  { section: "Inventory", key: "/admin/inventory/suppliers", label: "Suppliers & Packaging" },

  { section: "Sales", key: "/admin/promotions", label: "Promotions" },
  { section: "Sales", key: "/admin/coupons", label: "Coupons" },

  { section: "Marketing", key: "/admin/marketing", label: "Marketing Overview" },
  { section: "Marketing", key: "/admin/marketing/campaigns", label: "Campaigns" },
  { section: "Marketing", key: "/admin/marketing/creatives", label: "Creatives" },
  { section: "Marketing", key: "/admin/marketing/attribution", label: "Attribution" },
  { section: "Marketing", key: "/admin/marketing/audiences", label: "Audiences" },
  { section: "Marketing", key: "/admin/marketing/control", label: "Control Center" },
  { section: "Marketing", key: "/admin/marketing/automation", label: "Automation" },
  { section: "Marketing", key: "/admin/marketing/tracking", label: "Tracking Debug" },

  { section: "Content", key: "/admin/landing", label: "Landing Pages" },
  { section: "Content", key: "/admin/faqs", label: "FAQs" },

  { section: "Settings", key: "/admin/settings", label: "Site Settings" },
  { section: "Settings", key: "/admin/settings/delivery", label: "Delivery Settings" },
  { section: "Settings", key: "/admin/settings/sms-templates", label: "SMS Templates" },
  { section: "Settings", key: "/admin/settings/api", label: "API & Integrations" },
  { section: "Settings", key: "/admin/settings/retention", label: "Data Cleanup" },
];

export const STAFF_MODULE_KEYS = STAFF_MODULES.map((m) => m.key);

/** Sensitive capabilities granted on top of page access. */
export type StaffFlag = { key: string; label: string; hint: string };

export const STAFF_FLAGS: StaffFlag[] = [
  {
    key: "flag:inventory.cost",
    label: "See buying price & cost value",
    hint: "Average cost, cost value and the value-at-cost totals on inventory screens.",
  },
  {
    key: "flag:inventory.reorder",
    label: "Set reorder rules",
    hint: "View and edit the reorder point / reorder quantity on Live inventory.",
  },
  {
    key: "flag:order.discount",
    label: "Give discount on manual orders",
    hint: "Edit the Discount field while creating an order. Without it the discount stays 0.",
  },
  {
    key: "flag:data.export",
    label: "Download data exports (CSV)",
    hint: "Export report data such as Profit & Loss to a CSV file.",
  },
];

export const STAFF_FLAG_KEYS = STAFF_FLAGS.map((f) => f.key);

export const STAFF_PERMISSION_KEYS = [...STAFF_MODULE_KEYS, ...STAFF_FLAG_KEYS];

export const STAFF_SECTIONS = [...new Set(STAFF_MODULES.map((m) => m.section))];

export type AdminAccess = {
  userId: string;
  isAdmin: boolean;
  isStaff: boolean;
  fullAccess: boolean;
  isActive: boolean;
  /** Set when an admin ended this user's sessions after the token was issued. */
  revoked?: boolean;
  permissions: string[];
  name: string;
  email: string;
};

/** Longest-prefix page match, so /admin/orders/123 follows /admin/orders. */
export function canAccessPath(access: AdminAccess | null | undefined, pathname: string): boolean {
  if (!access) return false;
  if (!access.isActive) return false;
  if (access.isAdmin || access.fullAccess) return true;
  const path = pathname.replace(/\/+$/, "") || "/admin";
  if (path === "/admin") return access.permissions.includes("/admin");
  return access.permissions.some((key) => key !== "/admin" && (path === key || path.startsWith(`${key}/`)));
}

/** Sensitive capability check (full access / admin implies granted). */
export function hasFlag(access: AdminAccess | null | undefined, flag: string): boolean {
  if (!access || !access.isActive) return false;
  if (access.isAdmin || access.fullAccess) return true;
  return access.permissions.includes(flag);
}

/** Staff-management pages are reserved for real admins. */
export function canManageStaff(access: AdminAccess | null | undefined): boolean {
  return Boolean(access?.isAdmin);
}
