import { Link, Outlet, createFileRoute, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgePercent,
  Bot,
  Boxes,
  ChevronDown,
  ChevronLeft,
  Database,
  ExternalLink,
  Gift,
  Layers,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  BarChart3,
  BellRing,
  CalendarCheck,
  PiggyBank,
  Clapperboard,
  Users2,
  SlidersHorizontal,
  Megaphone,

  Package,
  PackagePlus,
  Warehouse,
  ClipboardCheck,
  ClipboardList,
  AlertOctagon,
  Scale,
  Undo2,

  PlusCircle,

  Rocket,
  Search as SearchIcon,
  Settings,
  Truck,
  FileSpreadsheet,
  ShoppingCart,
  ListOrdered,
  Ticket,

  X,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useIdleTimeout } from "@/lib/use-idle";
import { getAdminAccess, logAdminActivity } from "@/lib/staff.functions";
import { canAccessPath, canManageStaff } from "@/lib/rbac-shared";
import { BrandLoader } from "@/components/admin/brand-loader";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoMark from "@/assets/upoharkabbo-logo.png";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Upoharkabbo" },
      {
        name: "description",
        content:
          "Access the Upoharkabbo admin dashboard to manage products, categories, customer orders, and site content efficiently.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin Dashboard — Upoharkabbo" },
      {
        property: "og:description",
        content:
          "Access the Upoharkabbo admin dashboard to manage products, categories, customer orders, and site content efficiently.",
      },
    ],
  }),
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  adminOnly?: boolean;
};

const allSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Catalog",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/sub-products", label: "Sub-Products", icon: Layers },
      { to: "/admin/combos", label: "Build Package", icon: Gift },
      { to: "/admin/taxonomy", label: "Categories", icon: Boxes },
    ],
  },
  {
    title: "Orders",
    items: [
      { to: "/admin/orders/create", label: "Create Order", icon: PlusCircle },
      { to: "/admin/orders", label: "Web Orders", icon: ShoppingCart, exact: true },
      { to: "/admin/orders/list", label: "Order List", icon: ListOrdered },
      { to: "/admin/orders/search", label: "Search Orders", icon: SearchIcon },
    ],
  },
  {
    title: "Inventory",
    items: [
      { to: "/admin/inventory", label: "Dashboard", icon: Warehouse, exact: true },
      { to: "/admin/inventory/alerts", label: "Stock Alerts", icon: BellRing },
      { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", icon: FileSpreadsheet },
      { to: "/admin/inventory/receive", label: "Add Inventory", icon: PackagePlus },
      { to: "/admin/inventory/live", label: "Live Inventory", icon: ClipboardList },
      { to: "/admin/inventory/combos", label: "Smart Combos", icon: Layers },
      { to: "/admin/inventory/rto", label: "RTO Inspection", icon: Undo2 },
      { to: "/admin/inventory/reconcile", label: "Reconciliation", icon: Scale },
      { to: "/admin/inventory/adjust", label: "Loss & Damage", icon: AlertOctagon },
      { to: "/admin/inventory/count", label: "Stock Audit", icon: ClipboardCheck },
      { to: "/admin/inventory/reports", label: "Reports", icon: BarChart3 },
      { to: "/admin/inventory/profit", label: "Profit & Loss", icon: PiggyBank },
      { to: "/admin/inventory/closing", label: "Monthly Closing", icon: CalendarCheck },

      { to: "/admin/inventory/suppliers", label: "Suppliers & Packaging", icon: Boxes },
    ],
  },
  {
    title: "Sales",
    items: [
      { to: "/admin/promotions", label: "Promotions", icon: BadgePercent },
      { to: "/admin/coupons", label: "Coupons", icon: Ticket },
    ],
  },


  {
    title: "Marketing",
    items: [
      { to: "/admin/marketing", label: "Overview", icon: Megaphone, exact: true },
      { to: "/admin/marketing/campaigns", label: "Campaigns", icon: BarChart3 },
      { to: "/admin/marketing/creatives", label: "Creatives", icon: Clapperboard },
      { to: "/admin/marketing/attribution", label: "Attribution", icon: Boxes },
      { to: "/admin/marketing/audiences", label: "Audiences", icon: Users2 },
      { to: "/admin/marketing/control", label: "Control Center", icon: SlidersHorizontal },
      { to: "/admin/marketing/automation", label: "Automation", icon: Bot },
      { to: "/admin/marketing/tracking", label: "Tracking Debug", icon: Activity },
    ],
  },
  {
    title: "Content",
    items: [
      { to: "/admin/landing", label: "Landing Pages", icon: Rocket },
      { to: "/admin/faqs", label: "FAQs", icon: HelpCircle },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/admin/settings", label: "Site Settings", icon: Settings, exact: true },
      { to: "/admin/settings/delivery", label: "Delivery Settings", icon: Truck },
      { to: "/admin/settings/sms-templates", label: "SMS Templates", icon: MessageSquareText },
      { to: "/admin/settings/api", label: "API & Integrations", icon: KeyRound },
      { to: "/admin/settings/retention", label: "Data Cleanup", icon: Database },
      { to: "/admin/staff", label: "Staff & Access", icon: ShieldCheck, adminOnly: true },

    ],
  },
];

function AdminLayout() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const confirm = useConfirm();

  const requestSignOut = useCallback(async () => {
    const ok = await confirm({
      title: "Sign out of the admin panel?",
      description:
        "You'll need to sign in again to manage orders, products, and store settings.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay signed in",
      tone: "danger",
      icon: "logout",
    });
    if (ok) void signOut();
  }, [confirm, signOut]);

  // Idle guard: one hour without activity ends the admin session.
  useIdleTimeout(
    60 * 60_000,
    () => {
      toast.info("১ ঘণ্টা নিষ্ক্রিয় থাকায় সেশন শেষ হয়েছে — আবার লগইন করুন");
      void signOut();
    },
    Boolean(session),
  );

  const accessQuery = useQuery({
    queryKey: ["admin-access", session?.user.id ?? null],
    queryFn: () => getAdminAccess(),
    enabled: Boolean(session),
    refetchInterval: 60_000,
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
  const access = accessQuery.data ?? null;
  const manageStaff = canManageStaff(access);

  // An admin ended this session from Staff & Access.
  useEffect(() => {
    if (!access?.revoked) return;
    toast.info("একজন অ্যাডমিন আপনার সেশন বন্ধ করেছেন — আবার লগইন করুন");
    void signOut();
  }, [access?.revoked, signOut]);

  const sections = useMemo(
    () =>
      allSections
        .map((section) => ({
          title: section.title,
          items: section.items.filter(
            (item) =>
              (!item.adminOnly || manageStaff) && canAccessPath(access, item.to),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [access, manageStaff],
  );
  const firstAllowedPath = sections[0]?.items[0]?.to ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(() =>
    allSections.map((s) => s.title),
  );

  const matches = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  const activeSection = useMemo(
    () => sections.find((s) => s.items.some(matches))?.title ?? sections[0]?.title ?? "Overview",
    [pathname, sections],
  );

  const topItems = useMemo(
    () => sections.find((s) => s.title === activeSection)?.items ?? [],
    [activeSection, sections],
  );

  useEffect(() => {
    const saved = localStorage.getItem("admin-sidebar-collapsed");
    if (saved === "1") setCollapsed(true);
    const savedSections = localStorage.getItem("admin-sidebar-sections");
    if (savedSections) {
      try {
        const parsed = JSON.parse(savedSections) as string[];
        if (Array.isArray(parsed)) setOpenSections(parsed);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-sections", JSON.stringify(openSections));
  }, [openSections]);

  // Always reveal the section that contains the current page.
  useEffect(() => {
    setOpenSections((prev) => (prev.includes(activeSection) ? prev : [...prev, activeSection]));
  }, [activeSection]);


  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // While the mobile drawer is open, freeze the page behind it so scrolling
  // inside the menu never moves the content underneath.
  useEffect(() => {
    if (!mobileOpen) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevTouch = body.style.touchAction;
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prevOverflow;
      body.style.touchAction = prevTouch;
    };
  }, [mobileOpen]);


  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  // `/admin` is a convenient entry point, not necessarily a staff member's
  // home page. Send them to the first page the owner actually granted.
  useEffect(() => {
    if (
      pathname !== "/admin" ||
      accessQuery.isLoading ||
      !access?.isActive ||
      canAccessPath(access, "/admin") ||
      !firstAllowedPath
    ) {
      return;
    }
    void navigate({ to: firstAllowedPath as "/admin", replace: true });
  }, [access, accessQuery.isLoading, firstAllowedPath, navigate, pathname]);

  // Warm every admin route after the shell becomes idle. Navigation then only
  // swaps the already-loaded route component instead of waiting for its chunk.
  useEffect(() => {
    if (!session) return;

    const preloadRoutes = () => {
      for (const section of sections) {
        for (const item of section.items) {
          void router.preloadRoute({ to: item.to as "/admin" });
        }
      }
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadRoutes, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadRoutes, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [router, session, sections]);

  // Activity trail: one entry per admin page the signed-in user opens.
  useEffect(() => {
    if (!session || !access?.isActive) return;
    const id = globalThis.setTimeout(() => {
      void logAdminActivity({
        data: { action: "page.view", area: pathname, detail: `Opened ${pathname}` },
      }).catch(() => undefined);
    }, 800);
    return () => globalThis.clearTimeout(id);
  }, [pathname, session, access?.isActive]);

  if (loading || !session || accessQuery.isLoading) {
    return (
      <div className="admin-scope fixed inset-0 z-50 flex h-screen w-screen flex-col items-center justify-center bg-background">
        <BrandLoader size="lg" />
      </div>
    );
  }

  const signedInAllowed = Boolean(access && (access.isAdmin || (access.isStaff && access.isActive)));

  if (!signedInAllowed) {
    return (
      <div className="admin-scope mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="ig-text text-2xl font-bold">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {access?.isStaff
            ? "This employee account has been deactivated. Ask the owner to switch it back on."
            : "This account is not allowed in the admin panel."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void requestSignOut()}>
            Sign out
          </Button>
          <Button asChild>
            <Link to="/">Back to site</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (pathname === "/admin" && !canAccessPath(access, pathname) && firstAllowedPath) {
    return (
      <div className="admin-scope fixed inset-0 z-50 flex h-screen w-screen flex-col items-center justify-center bg-background">
        <BrandLoader size="lg" />
      </div>
    );
  }

  const isStaffPage = pathname.startsWith("/admin/staff");
  const pageAllowed = isStaffPage ? manageStaff : canAccessPath(access, pathname);

  const isActive = matches;
  const toggleSection = (title: string, el?: HTMLElement | null) => {
    const opening = !openSections.includes(title);
    setOpenSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
    if (!opening || !el) return;
    // Reveal the newly expanded items — otherwise the last sections stay
    // below the scroll fold and feel unreachable. The panel grows for ~600ms,
    // so nudge the scroll a few times while it settles.
    for (const delay of [200, 450, 700]) {
      globalThis.setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "end" });
      }, delay);
    }
  };

  const sidebar = (
    <div className="relative flex h-full flex-col">
      {/* Ambient glow — warm neutral, no deep blue */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-32 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="absolute -right-16 top-1/3 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-[7rem] items-center justify-center border-b border-white/10 px-4 py-6">
        <Link
          to="/admin"
          title="Upoharkabbo"
          className={cn("shrink-0 transition-all duration-300", collapsed ? "block" : "hidden")}
        >
          <img
            src="/favicon.png"
            alt="Upoharkabbo"
            className="size-12 rounded-xl bg-white object-contain p-1.5 ring-1 ring-white/15"
          />
        </Link>
        <Link
          to="/admin"
          title="Upoharkabbo"
          className={cn("shrink-0 transition-all duration-300", collapsed ? "hidden" : "block")}
        >
          <img
            src={logoMark}
            alt="Upoharkabbo"
            className="h-16 w-auto rounded-xl bg-white object-contain px-4 py-2.5 ring-1 ring-white/15"
          />
        </Link>
      </div>

      <nav className="relative flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-8 pt-5">
        {sections.map((section) => {
          const open = collapsed || openSections.includes(section.title);
          const hasActive = section.items.some(isActive);
          return (
            <div key={section.title} data-section={section.title}>
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                  collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                )}
              >
                <div className="overflow-hidden">
                  <button
                    type="button"
                    onClick={(e) =>
                      toggleSection(
                        section.title,
                        e.currentTarget.closest("div[data-section]") as HTMLElement | null,
                      )
                    }
                    aria-expanded={open}
                    tabIndex={collapsed ? -1 : 0}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors duration-300",
                      hasActive ? "text-slate-200" : "text-slate-400",
                      "hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <span className="truncate">{section.title}</span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                        open ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </button>
                </div>
              </div>


              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity,filter] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                  open
                    ? "grid-rows-[1fr] opacity-100 blur-0"
                    : "grid-rows-[0fr] opacity-0 blur-[2px]",
                )}
              
              >
                <div className="overflow-hidden">
                  <ul className={cn("space-y-1.5", collapsed ? "pt-0" : "pt-1.5")}>
                    {section.items.map((item) => {
                      const active = isActive(item);
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to as "/admin"}
                            title={item.label}
                            preload="intent"
                            tabIndex={open ? 0 : -1}
                            className={cn(
                              "group relative flex items-center gap-3.5 overflow-hidden rounded-xl px-3 py-3 text-[0.95rem] font-semibold tracking-tight transition-all duration-200",
                              collapsed && "justify-center px-0",
                              active
                                ? "bg-white/10 text-white shadow-lg shadow-black/30 ring-1 ring-inset ring-white/15 backdrop-blur-xl"
                                : "text-slate-300 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            {active && !collapsed && (
                              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-400" />
                            )}
                            <item.icon
                              className={cn(
                                "size-[19px] shrink-0 transition-colors",
                                active ? "text-white" : "text-slate-400 group-hover:text-white",
                              )}
                            />
                            <span
                              className={cn(
                                "min-w-0 truncate whitespace-nowrap transition-all duration-200",
                                collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
                              )}
                            >
                              {item.label}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="relative space-y-1.5 border-t border-white/10 px-4 py-4">
        <Link
          to="/"
          title="Go to Main Website"
          className={cn(
            "flex items-center gap-3.5 rounded-xl px-3 py-3 text-[0.95rem] font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          <ExternalLink className="size-[19px] shrink-0 text-slate-400" />
          <span className={cn("truncate transition-all duration-200", collapsed && "hidden")}>
            Go to Main Website
          </span>
        </Link>
        <button
          onClick={() => void requestSignOut()}
          title="Sign out"
          className={cn(
            "flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-[0.95rem] font-semibold text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="size-[19px] shrink-0" />
          <span className={cn("truncate transition-all duration-200", collapsed && "hidden")}>
            Sign out
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-scope min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden bg-[#0a0a0a] shadow-2xl shadow-black/40 transition-[width] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:block",
          collapsed ? "w-20" : "w-72",
        )}
      >
        {sidebar}
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label="Toggle sidebar"
          className="absolute -right-3 top-24 z-10 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow transition-all duration-300 hover:scale-110 hover:text-primary"
        >
          <ChevronLeft className={cn("size-4 transition-transform duration-500", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="" className="size-8 rounded-lg object-contain" />
          <span className="text-base font-bold tracking-tight">Upoharkabbo</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid size-9 place-items-center rounded-lg text-foreground transition-transform duration-150 hover:bg-accent active:scale-95"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-80 bg-[#0a0a0a] text-slate-100 transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="absolute right-2 top-4 z-10 grid size-8 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          collapsed ? "lg:pl-20" : "lg:pl-72",
        )}
      >
        {/* Quick section switcher — same links as the active sidebar section */}
        <div className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
          <div className="mx-auto flex h-[53px] w-full max-w-6xl items-center gap-2 overflow-x-auto px-4 lg:px-10">
            {topItems.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to as "/admin"}
                  preload="intent"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>


        <main className="admin-page mx-auto w-full max-w-6xl space-y-6 px-4 py-6 lg:px-10 lg:py-10">
          {pageAllowed ? (
            <Outlet />
          ) : (
            <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
              <h2 className="ig-text text-xl font-bold">This page is locked</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your account does not have permission for this page. Ask the owner to grant it in
                Staff &amp; Access.
              </p>
              {firstAllowedPath ? (
                <div className="mt-6 flex justify-center">
                  <Button asChild variant="outline">
                    <Link to={firstAllowedPath as "/admin"}>Go to an available page</Link>
                  </Button>
                </div>
              ) : (
                <div className="mt-6 flex justify-center gap-2">
                  <Button variant="outline" onClick={() => void requestSignOut()}>
                    Sign out
                  </Button>
                  <Button asChild>
                    <Link to="/">Back to site</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}

