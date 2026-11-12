import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Clock,
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users2,
} from "lucide-react";

import {
  adminCreateStaff,
  adminDeleteStaff,
  adminListStaff,
  adminUpdateStaff,
  type StaffRow,
  type StaffUpdateInput,
} from "@/lib/staff.functions";
import { adminForceLogout, adminStaffReport } from "@/lib/staff-report.functions";
import { STAFF_FLAGS, STAFF_MODULES, STAFF_PERMISSION_KEYS, STAFF_SECTIONS } from "@/lib/rbac-shared";
import { AdminHeading, Panel, StatCard, TextField } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/staff")({
  component: StaffPage,
  head: () => ({
    meta: [
      { title: "Staff & Access · Upoharkabbo Admin" },
      {
        name: "description",
        content:
          "Create employee accounts, control which admin pages each one can open, deactivate or delete accounts, and review activity.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type RangeKey = "today" | "yesterday" | "3d" | "7d" | "30d" | "custom";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "3d", label: "Last 3 days" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom range" },
];

function rangeBounds(key: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday":
      return { from: startOfDay(daysAgo(1)), to: endOfDay(daysAgo(1)) };
    case "3d":
      return { from: startOfDay(daysAgo(2)), to: endOfDay(now) };
    case "7d":
      return { from: startOfDay(daysAgo(6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(daysAgo(29)), to: endOfDay(now) };
    default: {
      const f = customFrom ? new Date(`${customFrom}T00:00:00`) : startOfDay(daysAgo(6));
      const t = customTo ? new Date(`${customTo}T23:59:59`) : endOfDay(now);
      return { from: f, to: t };
    }
  }
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function duration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%";
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

const emptyDraft = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  fullAccess: false,
  permissions: [] as string[],
};

function PermissionPicker({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  return (
    <div className={cn("space-y-4", disabled && "pointer-events-none opacity-50")}>
      {STAFF_SECTIONS.map((section) => {
        const items = STAFF_MODULES.filter((m) => m.section === section);
        const keys = items.map((i) => i.key);
        const allOn = keys.every((k) => value.includes(k));
        return (
          <div key={section} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {section}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() =>
                  onChange(
                    allOn
                      ? value.filter((k) => !keys.includes(k))
                      : [...new Set([...value, ...keys])],
                  )
                }
              >
                {allOn ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-accent/40"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[oklch(0.72_0.17_55)]"
                    checked={value.includes(item.key)}
                    onChange={() => toggle(item.key)}
                  />
                  <span className="truncate">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">
          Sensitive controls
        </p>
        <div className="space-y-2">
          {STAFF_FLAGS.map((flag) => (
            <div
              key={flag.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{flag.label}</p>
                <p className="text-[11px] text-muted-foreground">{flag.hint}</p>
              </div>
              <Switch
                checked={value.includes(flag.key)}
                onCheckedChange={() => toggle(flag.key)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StaffPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const staff = useQuery({ queryKey: ["admin", "staff"], queryFn: () => adminListStaff() });

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    fullName: string;
    phone: string;
    password: string;
    fullAccess: boolean;
    permissions: string[];
  } | null>(null);

  const [range, setRange] = useState<RangeKey>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [activityUser, setActivityUser] = useState<string>("");

  const bounds = useMemo(
    () => rangeBounds(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const activity = useQuery({
    queryKey: ["admin", "staff-activity", bounds.from.toISOString(), bounds.to.toISOString(), activityUser],
    queryFn: () =>
      adminStaffReport({
        data: {
          from: bounds.from.toISOString(),
          to: bounds.to.toISOString(),
          ...(activityUser ? { userId: activityUser } : {}),
        },
      }),
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
      qc.invalidateQueries({ queryKey: ["admin", "staff-activity"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: () =>
      adminCreateStaff({
        data: {
          fullName: draft.fullName,
          email: draft.email,
          password: draft.password,
          ...(draft.phone ? { phone: draft.phone } : {}),
          fullAccess: draft.fullAccess,
          permissions: draft.permissions,
        },
      }),
    onSuccess: async () => {
      toast.success("Employee account created");
      setDraft(emptyDraft);
      setCreating(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (input: StaffUpdateInput) => adminUpdateStaff({ data: input }),
    onSuccess: async () => {
      toast.success("Saved");
      setEditing(null);
      setEditDraft(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => adminDeleteStaff({ data: { userId } }),
    onSuccess: async () => {
      toast.success("Account deleted");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const forceLogout = useMutation({
    mutationFn: (userId: string) => adminForceLogout({ data: { userId } }),
    onSuccess: async () => {
      toast.success("Signed out of every device");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endSession = async (userId: string, name: string) => {
    const ok = await confirm({
      title: "End all sessions?",
      description: `${name} will be signed out of the admin panel on every device within a minute.`,
      confirmLabel: "Log out",
    });
    if (ok) forceLogout.mutate(userId);
  };

  const rows = staff.data ?? [];
  const activeCount = rows.filter((r) => r.is_active).length;

  const startEdit = (row: StaffRow) => {
    setEditing(row.user_id);
    setResetFor(null);
    setEditDraft({
      fullName: row.full_name,
      phone: row.phone ?? "",
      password: "",
      fullAccess: row.full_access,
      permissions: row.permissions ?? [],
    });
  };

  return (
    <div className="space-y-6 pb-16">
      <AdminHeading
        title="Staff & Access"
        description="Create employee logins, decide exactly which pages they can open, deactivate or delete accounts, and review their activity."
        action={
          <Button onClick={() => setCreating((v) => !v)}>
            <Plus className="mr-1.5 size-4" />
            {creating ? "Close" : "New employee"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Employees" value={String(rows.length)} icon={<Users2 className="size-4" />} />
        <StatCard label="Active" value={String(activeCount)} icon={<ShieldCheck className="size-4" />} />
        <StatCard
          label="Time on system (range)"
          value={duration((activity.data?.people ?? []).reduce((a, p) => a + p.activeMinutes, 0))}
          icon={<Clock className="size-4" />}
        />
      </div>

      {creating ? (
        <Panel className="space-y-4">
          <h2 className="ig-text text-sm font-bold">New employee account</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Full name"
              value={draft.fullName}
              onChange={(v) => setDraft((d) => ({ ...d, fullName: v }))}
              placeholder="Rakib Hasan"
            />
            <TextField
              label="Email"
              type="email"
              value={draft.email}
              onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
              placeholder="rakib@upoharkabbo.com"
            />
            <TextField
              label="Password"
              type="text"
              value={draft.password}
              onChange={(v) => setDraft((d) => ({ ...d, password: v }))}
              hint="Minimum 8 characters. Share it with the employee privately."
            />
            <TextField
              label="Phone (optional)"
              value={draft.phone}
              onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
              placeholder="+8801…"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold">Full access</p>
              <p className="text-xs text-muted-foreground">
                Gives every admin page, exactly like the owner account.
              </p>
            </div>
            <Switch
              checked={draft.fullAccess}
              onCheckedChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  fullAccess: v,
                  permissions: v ? [...STAFF_PERMISSION_KEYS] : [],
                }))
              }
            />
          </div>

          <PermissionPicker
            value={draft.permissions}
            disabled={draft.fullAccess}
            onChange={(next) => setDraft((d) => ({ ...d, permissions: next }))}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                create.isPending ||
                draft.fullName.trim().length < 2 ||
                !draft.email.includes("@") ||
                draft.password.length < 8
              }
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel className="space-y-3">
        <h2 className="ig-text text-sm font-bold">Employees</h2>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No employee accounts yet. Use “New employee” to add one.
          </p>
        ) : null}

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.user_id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {row.full_name}{" "}
                    <span
                      className={cn(
                        "ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        row.is_active
                          ? "bg-primary/15 text-primary"
                          : "bg-destructive/15 text-destructive",
                      )}
                    >
                      {row.is_active ? "Active" : "Disabled"}
                    </span>
                    {row.full_access ? (
                      <span className="ml-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                        Full access
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ""} ·{" "}
                    {row.full_access
                      ? "all pages"
                      : `${row.permissions?.length ?? 0} page${(row.permissions?.length ?? 0) === 1 ? "" : "s"}`}
                    {row.last_login_at ? ` · last seen ${formatWhen(row.last_login_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(v) =>
                        update.mutate({ userId: row.user_id, isActive: v })
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (editing === row.user_id ? setEditing(null) : startEdit(row))}
                  >
                    <UserCog className="mr-1.5 size-4" />
                    {editing === row.user_id ? "Close" : "Edit"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete ${row.full_name}?`,
                        description:
                          "The login is removed permanently and the employee can no longer sign in. Their activity history stays.",
                        confirmLabel: "Delete",
                        tone: "danger",
                      });
                      if (ok) remove.mutate(row.user_id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {editing === row.user_id && editDraft ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label="Full name"
                      value={editDraft.fullName}
                      onChange={(v) => setEditDraft((d) => (d ? { ...d, fullName: v } : d))}
                    />
                    <TextField
                      label="Phone"
                      value={editDraft.phone}
                      onChange={(v) => setEditDraft((d) => (d ? { ...d, phone: v } : d))}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Password</Label>
                      {resetFor === row.user_id ? (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                          <div className="flex gap-2">
                            <Input
                              value={editDraft.password}
                              placeholder="New password (min 8 characters)"
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, password: e.target.value } : d))
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setEditDraft((d) => (d ? { ...d, password: randomPassword() } : d))
                              }
                            >
                              Generate
                            </Button>
                          </div>
                          <p className="text-[11px] text-amber-800">
                            Save changes করলে নতুন পাসওয়ার্ড চালু হবে। কর্মীকে গোপনে জানিয়ে দিন।
                          </p>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-muted-foreground underline"
                            onClick={() => {
                              setResetFor(null);
                              setEditDraft((d) => (d ? { ...d, password: "" } : d));
                            }}
                          >
                            বাতিল করুন
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-center"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Reset password for ${row.full_name}?`,
                              description:
                                "পুরোনো পাসওয়ার্ড আর কাজ করবে না। কনফার্ম করলে নতুন পাসওয়ার্ড লেখা বা র‍্যান্ডমভাবে জেনারেট করা যাবে।",
                              confirmLabel: "Reset password",
                              tone: "danger",
                            });
                            if (ok) {
                              setResetFor(row.user_id);
                              setEditDraft((d) => (d ? { ...d, password: randomPassword() } : d));
                            }
                          }}
                        >
                          <KeyRound className="mr-1.5 size-4" />
                          Reset password
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border p-3">
                    <div>
                      <p className="text-sm font-semibold">Full access</p>
                      <p className="text-xs text-muted-foreground">Every admin page, like the owner.</p>
                    </div>
                    <Switch
                      checked={editDraft.fullAccess}
                      onCheckedChange={(v) =>
                        setEditDraft((d) =>
                          d
                            ? { ...d, fullAccess: v, permissions: v ? [...STAFF_PERMISSION_KEYS] : d.permissions }
                            : d,
                        )
                      }
                    />
                  </div>

                  <PermissionPicker
                    value={editDraft.permissions}
                    disabled={editDraft.fullAccess}
                    onChange={(next) => setEditDraft((d) => (d ? { ...d, permissions: next } : d))}
                  />

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          userId: row.user_id,
                          fullName: editDraft.fullName,
                          phone: editDraft.phone,
                          fullAccess: editDraft.fullAccess,
                          permissions: editDraft.permissions,
                          ...(editDraft.password ? { password: editDraft.password } : {}),
                        })
                      }
                    >
                      <KeyRound className="mr-1.5 size-4" />
                      {update.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ig-text text-sm font-bold">Employee performance</h2>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  range === r.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {range === "custom" ? (
            <>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          ) : null}
          <div>
            <Label className="text-xs">Employee</Label>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={activityUser}
              onChange={(e) => setActivityUser(e.target.value)}
            >
              <option value="">Everyone</option>
              {rows.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activity.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Building report…</p>
        ) : (activity.data?.people ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-bold">Employee</th>
                  <th className="px-2 py-2 text-right font-bold">Time</th>
                  <th className="px-2 py-2 text-right font-bold">Sessions</th>
                  <th className="px-2 py-2 text-right font-bold">Created</th>
                  <th className="px-2 py-2 text-right font-bold">Confirmed</th>
                  <th className="px-2 py-2 text-right font-bold">Delivered</th>
                  <th className="px-2 py-2 text-right font-bold">Cancelled</th>
                  <th className="px-2 py-2 text-right font-bold">Returned</th>
                  <th className="px-2 py-2 text-right font-bold">Incomplete → confirmed</th>
                  <th className="px-2 py-2 text-right font-bold">Sales</th>
                  <th className="px-2 py-2 text-right font-bold">Session</th>
                </tr>
              </thead>
              <tbody>
                {(activity.data?.people ?? []).map((p) => (
                  <tr key={p.userId} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.email || "—"}
                        {p.lastIp ? ` · IP ${p.lastIp}` : ""}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{duration(p.activeMinutes)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{p.sessions}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {p.ordersCreated}
                      <span className="block text-[11px] text-muted-foreground">
                        {money(p.ordersCreatedValue)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                      {p.confirmed}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {p.delivered}
                      <span className="block text-[11px] text-muted-foreground">{money(p.deliveredValue)}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-rose-600">{p.cancelled}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-amber-600">{p.returned}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{p.incompleteConverted}</td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums">{money(p.confirmedValue)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={forceLogout.isPending}
                        onClick={() => void endSession(p.userId, p.name)}
                      >
                        <LogOut className="mr-1 size-3.5" />
                        Log out
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border">
            <p className="border-b border-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Login sessions · IP & device
            </p>
            <div className="max-h-96 overflow-auto">
              {(activity.data?.sessions ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No sessions in this range.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(activity.data?.sessions ?? []).map((s) => (
                    <li key={s.key} className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatWhen(s.startAt)} → {formatWhen(s.endAt)}
                        </span>
                        <span className="ml-auto text-xs font-bold tabular-nums">{duration(s.minutes)}</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        IP {s.ip ?? "—"} · {s.events} actions · {s.userAgent ?? "unknown device"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <p className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Activity className="size-3.5" /> Recent activity
            </p>
            <div className="max-h-96 overflow-auto">
              {(activity.data?.recent ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No entries.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(activity.data?.recent ?? []).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
                      <span className="w-28 shrink-0 text-xs text-muted-foreground">
                        {formatWhen(r.created_at)}
                      </span>
                      <span className="font-semibold">{r.actor_name ?? "Admin"}</span>
                      <span className="truncate text-muted-foreground">{r.detail ?? r.action}</span>
                      {r.ip ? (
                        <span className="ml-auto text-[11px] text-muted-foreground">{r.ip}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
