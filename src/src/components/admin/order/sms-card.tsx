import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, RotateCw, Send } from "lucide-react";
import { VariableTextarea } from "@/components/admin/variable-textarea";
import { renderSmsTemplate } from "@/lib/sms-template";

import { AUTO_SMS_KEYS, adminListSmsTemplates } from "@/lib/sms-templates.functions";
import { adminRetrySms, adminSendSms } from "@/lib/order-admin.functions";
import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SmsLogRow = {
  id: string;
  phone: string;
  message: string;
  status: string;
  provider_code: string | null;
  provider_response?: string | null;
  segments: number;
  is_manual: boolean;
  sent_by_name: string | null;
  created_at: string;
};

/** Bangla text is sent as UCS-2: 70 chars for one part, 67 per part after that. */
function segmentInfo(message: string) {
  const unicode = /[^\u0000-\u007F]/.test(message);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const parts = message.length === 0 ? 0 : message.length <= single ? 1 : Math.ceil(message.length / multi);
  return { unicode, parts, limit: single };
}

const dt = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

/** Gradient launcher card + composer modal for manual customer SMS. */
export function SmsCard({
  orderId,
  phone,
  vars = {},
}: {
  orderId: string;
  phone: string;
  /** Real per-order values; variables render as these in the composer. */
  vars?: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("");
  const [message, setMessage] = useState("");

  const seg = segmentInfo(message);

  const tplQuery = useQuery({
    queryKey: ["admin", "sms-templates"],
    queryFn: () => adminListSmsTemplates(),
  });
  const allTemplates = tplQuery.data?.templates ?? [];
  const smsTemplates = allTemplates.filter((t) => !t.key || !AUTO_SMS_KEYS.has(t.key));
  const smsVariables = allTemplates.find((t) => t.key === "order_confirm")?.variables ?? [
    "name",
    "order_no",
    "amount",
    "phone",
    "receipt_url",
  ];

  const send = useMutation({
    mutationFn: () => adminSendSms({ data: { orderId, phone, message } }),
    onSuccess: async (res) => {
      if (res.ok) toast.success(`SMS sent — ${res.message}`);
      else toast.error(`SMS failed${res.code ? ` (#${res.code})` : ""} — ${res.message}`);
      setOpen(false);
      setMessage("");
      setTemplate("");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Panel className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-slate-800 via-slate-800 to-indigo-800 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white/15">
              <Send className="size-4 text-white" />
            </span>
            <div>
              <p className="text-sm font-bold text-white">Send SMS to customer</p>
              <p className="text-xs text-white/70">Ready → {phone}</p>
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-full bg-white/20 text-white hover:bg-white/30"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Open"}
          </Button>
        </div>

      {open ? (
        <div className="border-t border-border">
          <div className="w-full space-y-4 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <MessageSquare className="size-4 text-primary" />
              Send SMS to customer
            </h3>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Template
              </p>
              <select
                className="h-10 w-full rounded-xl border border-border/80 bg-background/70 px-3 text-sm"
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  const found = smsTemplates.find((t) => t.id === e.target.value);
                  if (found) setMessage(renderSmsTemplate(found.body, vars));
                }}
              >
                <option value="">— Select or write your own —</option>
                {smsTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <VariableTextarea
                value={message}
                onChange={setMessage}
                variables={smsVariables}
                values={vars}
                rows={5}
                maxLength={1000}
                placeholder="আপনার SMS টাইপ করুন — ভেরিয়েবলের জন্য / টাইপ করুন"
                label="Variables — tap to insert real value, or type /"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Sends to: <b className="font-mono text-foreground">{phone}</b>
                </span>
                <span>
                  {message.length}/1000 · {seg.parts} SMS ({seg.unicode ? "Bangla/Unicode" : "English"},{" "}
                  {seg.limit} chars first part)
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={send.isPending}
                disabled={message.trim().length === 0}
                onClick={() => send.mutate()}
              >
                <Send className="size-3.5" />
                Send SMS
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      </Panel>
    </>

  );
}

/** SMS delivery history with per-message retry. */
export function CommunicationLog({
  logs,
  autoStatus,
}: {
  logs: SmsLogRow[];
  autoStatus: string;
}) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: (id: string) => adminRetrySms({ data: { id } }),
    onSuccess: async (res) => {
      if (res.ok) toast.success(`SMS resent — ${res.message}`);
      else toast.error(`Retry failed${res.code ? ` (#${res.code})` : ""} — ${res.message}`);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <MessageSquare className="size-4 text-primary" />
        Communication log
      </h2>

      <div className="rounded-xl border border-border/70 bg-background/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Auto SMS confirmation
        </p>
        <p className="mt-1 text-sm font-semibold">
          {autoStatus === "sent" ? "Sent" : "Not sent"}
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SMS sent for this order yet.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">
                  SMS
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                    log.status === "sent"
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                      : log.status === "pending"
                        ? "bg-amber-50 text-amber-800 ring-amber-200"
                        : "bg-rose-50 text-rose-800 ring-rose-200",
                  )}
                >
                  {log.status.toUpperCase()}
                  {log.provider_code ? ` #${log.provider_code}` : ""}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {log.is_manual ? "Manual" : "Auto"}
                </span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                  {log.segments} SMS
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{dt(log.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{log.message}</p>
              {log.provider_response ? (
                <p className="text-xs text-muted-foreground">{log.provider_response}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{log.sent_by_name ?? "Staff"}</span>
                <span className="font-mono">{log.phone}</span>
                {log.status !== "sent" ? (
                  <button
                    type="button"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(log.id)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 font-semibold text-foreground transition-[colors,transform] active:scale-95 hover:border-primary/40 hover:bg-accent disabled:opacity-60"
                  >
                    <RotateCw className={retry.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
                    {retry.isPending ? "Retrying…" : "Retry"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
