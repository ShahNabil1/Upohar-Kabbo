import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Radio,
  Save,
  Star,
  Trash2,
  TriangleAlert,
  Truck,
} from "lucide-react";

import {
  adminListDeliveryPartners,
  adminRemoveDeliveryPartner,
  adminSaveDeliveryPartner,
  adminSetDefaultDeliveryPartner,
  adminSetDeliveryPartnerEnabled,
  adminTestCourierWebhook,
  adminTestDeliveryPartner,
  type DeliveryPartnerRow,
} from "@/lib/delivery.functions";
import {
  DELIVERY_PROVIDERS,
  SECRET_MASK,
  providerFields,
  providerLabels,
  type DeliveryProvider,
} from "@/lib/delivery-shared";
import { AdminHeading, Panel } from "@/components/admin/kit";
import { CourierMark, courierKey } from "@/components/admin/courier-logo";

import { BrandLoader } from "@/components/admin/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings/delivery")({
  component: DeliverySettings,
  head: () => ({
    meta: [
      { title: "Delivery Settings · Upoharkabbo Admin" },
      { name: "description", content: "Connect Steadfast, Pathao and Carrybee courier accounts." },
    ],
  }),
});

const BRAND_WEBHOOK_ORIGIN = "https://upoharkabbo.com";

function webhookUrl(provider: DeliveryProvider) {
  return `${BRAND_WEBHOOK_ORIGIN}/api/public/courier/${provider}`;
}

function DeliverySettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "delivery-partners"],
    queryFn: () => adminListDeliveryPartners(),
  });
  const partners = useMemo<DeliveryPartnerRow[]>(() => data ?? [], [data]);

  const [adding, setAdding] = useState<DeliveryProvider | "">("");
  const available = DELIVERY_PROVIDERS.filter((p) => !partners.some((x) => x.provider === p));

  const draftProviders = useMemo(() => {
    const list = partners.map((p) => p.provider);
    if (adding && !list.includes(adding)) list.push(adding);
    return list;
  }, [partners, adding]);

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Delivery Settings"
        description="Connect courier accounts, verify credentials live and copy the webhook URL."
      />

      {available.length > 0 ? (
        <Panel className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Add delivery partner</label>
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value as DeliveryProvider | "")}
              className="h-10 w-56 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none transition focus:border-primary/50"
            >
              <option value="">Select a partner…</option>
              {available.map((p) => (
                <option key={p} value={p}>
                  {providerLabels[p]}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={!adding}
            onClick={() => toast.info(`Fill in ${providerLabels[adding as DeliveryProvider]} details below, then save.`)}
            className="active:scale-95"
          >
            <Plus className="size-4" />
            Add
          </Button>
        </Panel>
      ) : null}

      {isLoading ? (
        <BrandLoader size="md" className="py-10" />
      ) : draftProviders.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-muted-foreground">
          No delivery partner added yet. Pick one above to get started.
        </Panel>
      ) : (
        <div className="space-y-5">
          {draftProviders.map((provider) => (
            <PartnerCard
              key={provider}
              provider={provider}
              row={partners.find((p) => p.provider === provider) ?? null}
              onDone={() => {
                setAdding("");
                void qc.invalidateQueries({ queryKey: ["admin", "delivery-partners"] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerCard({
  provider,
  row,
  onDone,
}: {
  provider: DeliveryProvider;
  row: DeliveryPartnerRow | null;
  onDone: () => void;
}) {
  const fields = providerFields[provider];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = row?.credentials?.[f.key] ?? "";
    return init;
  });
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    row ? JSON.stringify(Object.fromEntries(fields.map((f) => [f.key, row.credentials?.[f.key] ?? ""]))) : null,
  );
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [noteTemplate, setNoteTemplate] = useState(row?.note_template ?? "");
  const [savedTemplate, setSavedTemplate] = useState(row?.note_template ?? "");
  const [makingDefault, setMakingDefault] = useState(false);
  const isDirty =
    savedSnapshot === null ||
    JSON.stringify(values) !== savedSnapshot ||
    noteTemplate !== savedTemplate;

  const noteMax = provider === "carrybee" ? 255 : 500;

  const noteError = (() => {
    const value = noteTemplate;
    if (!value) return null;
    if (!value.trim()) return "Note template can't be only spaces.";
    if (value.trim().length < 3) return "Note template must be at least 3 characters.";
    if (value.length > noteMax) return `Note template must be ${noteMax} characters or fewer.`;
    if (/[<>]/.test(value)) return "Note template can't contain < or > characters.";
    if (/(https?:\/\/|www\.)/i.test(value)) return "Links aren't allowed in the delivery note.";
    return null;
  })();

  const [removeOpen, setRemoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const locked = Boolean(row) && !unlocked;
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    row ? { ok: row.connection_ok, message: row.connection_message ?? "" } : null,
  );
  const [stores, setStores] = useState<{ store_id: string | number; store_name: string }[]>(
    row?.stores ?? [],
  );
  const [pinging, setPinging] = useState(false);
  const [ping, setPing] = useState<{ ok: boolean; status: number; body: string } | null>(null);

  const url = webhookUrl(provider);

  const pingWebhook = async () => {
    setPinging(true);
    setPing(null);
    try {
      const res = await adminTestCourierWebhook({ data: { provider } });
      setPing({ ok: res.ok, status: res.status, body: res.body });
      if (res.ok) toast.success("Our webhook endpoint responded correctly (courier-side setup still needed)");
      else toast.error("Webhook endpoint check failed — see details below");
    } catch (error) {
      const message = (error as Error).message;
      setPing({ ok: false, status: 0, body: message });
      toast.error(message);
    } finally {
      setPinging(false);
    }
  };



  const test = async () => {
    setTesting(true);
    try {
      const res = await adminTestDeliveryPartner({ data: { provider, credentials: values } });
      setResult({ ok: res.ok, message: res.message });
      setStores(res.stores ?? []);
      // Never call onDone() here: for a not-yet-saved partner it clears the draft
      // selection and unmounts this card, losing the typed credentials.
      if (res.ok) toast.success(`${providerLabels[provider]}: ${res.message}`);
      else toast.error(res.message);
    } catch (error) {
      const message = (error as Error).message;
      setResult({ ok: false, message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (noteError) {
      toast.error(noteError);
      return;
    }
    setSaving(true);
    try {
      const res = await adminSaveDeliveryPartner({
        data: { provider, enabled, credentials: values, noteTemplate: noteTemplate.trim(), config: {} },
      });
      setResult({ ok: true, message: res.message });
      setSavedSnapshot(JSON.stringify(values));
      setUnlocked(false);
      setNoteTemplate(noteTemplate.trim()); setSavedTemplate(noteTemplate.trim());

      toast.success(`${providerLabels[provider]} saved`);
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await adminRemoveDeliveryPartner({ data: { provider } });
      toast.success(`${providerLabels[provider]} removed`);
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Panel className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {courierKey(provider) ? (
            <CourierMark partner={provider} className="size-10" />
          ) : (
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Truck className="size-5" />
            </span>
          )}

          <div>
            <h3 className="text-base font-bold text-foreground">{providerLabels[provider]}</h3>
            <p className="text-xs text-muted-foreground">
              {row?.last_checked_at
                ? `Last checked ${new Date(row.last_checked_at).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}`
                : "Not verified yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1",
                result.ok
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-rose-200",
              )}
            >
              {result.ok ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
              {result.ok ? "Connected" : "Not connected"}
            </span>
          ) : null}
          {row ? (
            row.is_default ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                <Star className="size-3.5 fill-amber-500 text-amber-500" />
                Default
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={makingDefault}
                className="active:scale-95"
                onClick={async () => {
                  setMakingDefault(true);
                  try {
                    await adminSetDefaultDeliveryPartner({ data: { provider } });
                    toast.success(`${providerLabels[provider]} is now the default courier`);
                    onDone();
                  } catch (error) {
                    toast.error((error as Error).message);
                  } finally {
                    setMakingDefault(false);
                  }
                }}
              >
                {makingDefault ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
                Make default
              </Button>
            )
          ) : null}
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Active
            <Switch
              checked={enabled}
              onCheckedChange={async (next) => {
                setEnabled(next);
                if (row) {
                  try {
                    await adminSetDeliveryPartnerEnabled({ data: { provider, enabled: next } });
                    toast.success(next ? "Partner activated" : "Partner deactivated");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }
              }}
            />
          </label>
        </div>
      </div>


      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              {f.label}
              {f.optional ? <span className="ml-1 font-normal">(optional)</span> : null}
            </label>
            <Input
              type={f.secret ? "password" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder ?? ""}
              autoComplete="off"
              disabled={locked}
              onFocus={() => {
                if (values[f.key] === SECRET_MASK) setValues((v) => ({ ...v, [f.key]: "" }));
              }}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="rounded-xl"
            />
            {f.hint ? <p className="text-[11px] text-muted-foreground">{f.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Truck className="size-3.5" />
          Delivery note template — auto-filled when {providerLabels[provider]} is selected
        </label>
        <Textarea
          rows={3}
          maxLength={noteMax}
          disabled={locked}
          aria-invalid={noteError ? true : undefined}
          className={`rounded-xl ${noteError ? "border-destructive focus-visible:ring-destructive/40" : ""}`}
          placeholder="e.g. Please call before delivery. Fragile item — handle with care."
          value={noteTemplate}
          onChange={(e) => setNoteTemplate(e.target.value)}
          onBlur={() => setNoteTemplate((v) => v.replace(/[ \t]+\n/g, "\n").trim())}
        />

        {noteError ? (
          <p className="text-[11px] font-medium text-destructive">{noteError}</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {noteTemplate.length}/{noteMax} · Applied automatically to the order's delivery note when this
          courier is chosen. Turning the delivery-note checkbox off clears it again.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link2 className="size-3.5" />
          Webhook URL — paste this into the {providerLabels[provider]} panel
        </label>
        <div className="flex gap-2">
          <Input readOnly value={url} className="rounded-xl font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 active:scale-95"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success("Webhook URL copied");
            }}
          >
            <Copy className="size-4" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pinging || !row?.webhook_secret}
            className="shrink-0 active:scale-95"
            onClick={() => void pingWebhook()}
          >
            {pinging ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Radio className="size-4" />
            )}
            Test webhook
          </Button>
        </div>
        {ping ? (
          <div
            className={cn(
              "space-y-1 rounded-xl px-3 py-2 text-xs",
              ping.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700",
            )}
          >
            <p className="font-semibold">
              Endpoint responded {ping.status || "no response"}{" "}
              {ping.ok
                ? "· receiver reachable & response format valid"
                : "· receiver check failed"}
            </p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] opacity-90">
              {ping.body}
            </pre>
          </div>
        ) : null}
      </div>


      {row?.webhook_secret ? (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Link2 className="size-3.5" />
            Webhook secret — set this as the secret/signature in {providerLabels[provider]}
          </label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={row.webhook_secret}
              className="rounded-xl font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 active:scale-95"
              onClick={() => {
                void navigator.clipboard.writeText(row.webhook_secret ?? "");
                toast.success("Webhook secret copied");
              }}
            >
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      {result && !result.ok && result.message ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {result.message}
        </p>
      ) : null}
      {result?.ok && result.message ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          {result.message}
        </p>
      ) : null}

      {stores.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Stores:</span>
          {stores.map((s) => (
            <span
              key={String(s.store_id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
            >
              {s.store_name}
              <code className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] text-emerald-700">
                #{s.store_id}
              </code>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={test} disabled={testing} className="active:scale-95">
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
          Test connection
        </Button>
        {locked ? (
          <>
            <Button type="button" onClick={() => setEditOpen(true)} className="active:scale-95">
              <Pencil className="size-4" />
              Edit credentials
            </Button>
            <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                    <TriangleAlert className="size-5" />
                    Edit {providerLabels[provider]} credentials?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    These credentials are live. A wrong or incomplete value will immediately break
                    this courier — order dispatch, tracking and webhooks can stop working. Only
                    continue if you have the correct values at hand, and run “Test connection”
                    before saving.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-xl bg-amber-600 text-white hover:bg-amber-700 active:scale-95"
                    onClick={(e) => {
                      e.preventDefault();
                      setEditOpen(false);
                      setUnlocked(true);
                    }}
                  >
                    I understand, let me edit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={save}
              disabled={saving || !result?.ok || !isDirty || !!noteError}
              className="bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : !isDirty ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {!isDirty && !saving ? "Saved" : "Save partner"}
            </Button>
            {row ? (
              <Button
                type="button"
                variant="outline"
                className="active:scale-95"
                onClick={() => {
                  const init: Record<string, string> = {};
                  for (const f of fields) init[f.key] = row.credentials?.[f.key] ?? "";
                  setValues(init);
                  setNoteTemplate(savedTemplate);
                  setUnlocked(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
            {!result?.ok ? (
              <span className="text-xs text-muted-foreground">
                Run a successful connection test before saving.
              </span>
            ) : !isDirty ? (
              <span className="text-xs text-muted-foreground">No unsaved changes.</span>
            ) : null}
          </>
        )}

        {row ? (
          <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={removing}
                className="ml-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700 active:scale-95"
              >
                {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                  <TriangleAlert className="size-5" />
                  Remove {providerLabels[provider]}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes the saved credentials and webhook secret for {providerLabels[provider]}.
                  Existing consignments stay intact, but new orders can no longer be dispatched to this
                  courier until you reconnect it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-xl bg-rose-600 text-white hover:bg-rose-700 active:scale-95"
                  onClick={(e) => {
                    e.preventDefault();
                    setRemoveOpen(false);
                    void remove();
                  }}
                >
                  Yes, remove partner
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </Panel>
  );
}
