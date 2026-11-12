import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crop as CropIcon, Loader2, RotateCw, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type CropPreset = {
  id: string;
  label: string;
  /** null = free-form crop. */
  ratio: number | null;
};

/** Aspect ratios the storefront actually renders. */
export const CROP_PRESETS: CropPreset[] = [
  { id: "free", label: "ফ্রি", ratio: null },
  { id: "square", label: "১:১", ratio: 1 },
  { id: "card", label: "৪:৫", ratio: 4 / 5 },
  { id: "product", label: "৩:৪", ratio: 3 / 4 },
  { id: "landing", label: "১৬:৯", ratio: 16 / 9 },
  { id: "og", label: "১.৯১:১", ratio: 1.91 },
];

type Rect = { x: number; y: number; w: number; h: number };

const MIN_SIZE = 24;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("ছবিটি লোড করা যায়নি (CORS?)"));
    img.src = src;
  });
}

function rotateSource(img: HTMLImageElement): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(URL.createObjectURL(b!)), "image/webp", 0.95),
  );
}

/** Fit the crop box inside the displayed image, honouring the aspect ratio. */
function fitRect(box: { w: number; h: number }, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: box.w, h: box.h };
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) {
    h = box.h;
    w = h * ratio;
  }
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

type HandleId = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

const HANDLES: { id: HandleId; className: string; corner: boolean }[] = [
  { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize", corner: true },
  { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize", corner: true },
  { id: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize", corner: true },
  { id: "se", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize", corner: true },
  { id: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize", corner: false },
  { id: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize", corner: false },
  { id: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize", corner: false },
  { id: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize", corner: false },
];

/**
 * Standard crop dialog: the whole image is always visible, a draggable and
 * resizable crop rectangle sits on top of it, with optional aspect locks.
 */
export function ImageCropperDialog({
  src,
  fileName = "image.webp",
  initialPreset = "free",
  onCancel,
  onCropped,
}: {
  src: string;
  fileName?: string | undefined;
  initialPreset?: string | undefined;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(src);
  const [presetId, setPresetId] = useState(
    CROP_PRESETS.some((p) => p.id === initialPreset) ? initialPreset : "free",
  );
  const [busy, setBusy] = useState(false);
  /** Rendered image box inside the stage (letterboxed, object-contain). */
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ mode: "move" | HandleId; px: number; py: number; start: Rect } | null>(
    null,
  );

  const ratio = CROP_PRESETS.find((p) => p.id === presetId)?.ratio ?? null;

  useEffect(() => setMounted(true), []);

  // Lock the page behind the dialog.
  useEffect(() => {
    if (!mounted) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadImage(source)
      .then((img) => alive && setImage(img))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "লোড করা যায়নি"));
    return () => {
      alive = false;
    };
  }, [source]);

  // Track the rendered image box.
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image]);

  // Reset the crop box whenever the image or aspect changes.
  useEffect(() => {
    if (!box.w || !box.h) return;
    setRect(fitRect(box, ratio));
  }, [box.w, box.h, ratio]);

  const onPointerDown = (mode: "move" | HandleId) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, px: e.clientX, py: e.clientY, start: rect };
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || !box.w) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      const s = d.start;

      if (d.mode === "move") {
        setRect({
          ...s,
          x: clamp(s.x + dx, 0, box.w - s.w),
          y: clamp(s.y + dy, 0, box.h - s.h),
        });
        return;
      }

      let { x, y, w, h } = s;
      const right = s.x + s.w;
      const bottom = s.y + s.h;

      if (d.mode.includes("w")) {
        x = clamp(s.x + dx, 0, right - MIN_SIZE);
        w = right - x;
      }
      if (d.mode.includes("e")) {
        w = clamp(s.w + dx, MIN_SIZE, box.w - s.x);
      }
      if (d.mode.includes("n")) {
        y = clamp(s.y + dy, 0, bottom - MIN_SIZE);
        h = bottom - y;
      }
      if (d.mode.includes("s")) {
        h = clamp(s.h + dy, MIN_SIZE, box.h - s.y);
      }

      if (ratio) {
        // Keep the aspect: derive the other edge, anchored on the dragged corner.
        const horizontal = d.mode.includes("w") || d.mode.includes("e");
        if (horizontal) h = w / ratio;
        else w = h * ratio;
        if (d.mode.includes("n")) y = bottom - h;
        if (d.mode.includes("w")) x = right - w;
        // Clamp back inside the image without breaking the ratio.
        if (x < 0 || y < 0 || x + w > box.w || y + h > box.h) {
          const scale = Math.min(
            1,
            x < 0 ? (right - 0) / w : 1,
            y < 0 ? (bottom - 0) / h : 1,
            x + w > box.w ? (box.w - x) / w : 1,
            y + h > box.h ? (box.h - y) / h : 1,
          );
          w *= scale;
          h *= scale;
          if (d.mode.includes("n")) y = bottom - h;
          if (d.mode.includes("w")) x = right - w;
          x = clamp(x, 0, box.w - w);
          y = clamp(y, 0, box.h - h);
        }
      }

      setRect({ x, y, w, h });
    },
    [box, ratio],
  );

  const endDrag = () => {
    dragRef.current = null;
  };

  const confirm = async () => {
    if (!image || !rect.w || !box.w) return;
    setBusy(true);
    try {
      const sx = (rect.x / box.w) * image.naturalWidth;
      const sy = (rect.y / box.h) * image.naturalHeight;
      const sw = (rect.w / box.w) * image.naturalWidth;
      const sh = (rect.h / box.h) * image.naturalHeight;
      const fit = Math.min(1, 2000 / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * fit));
      const outH = Math.max(1, Math.round(sh * fit));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.92),
      );
      if (!blob) throw new Error("ক্রপ করা যায়নি");
      const base = fileName.replace(/\.[^.]+$/, "") || "image";
      onCropped(new File([blob], `${base}-crop.webp`, { type: "image/webp" }));
    } catch {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <CropIcon className="size-4 text-primary" />
            <p className="text-sm font-bold">ছবি ক্রপ করুন</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2.5">
          {CROP_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                p.id === presetId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRect(fitRect(box, ratio))}
              className="rounded-lg border border-border/80 bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              রিসেট
            </button>
            <button
              type="button"
              title="৯০° ঘোরান"
              onClick={async () => {
                if (!image) return;
                const url = await rotateSource(image);
                setImage(null);
                setSource(url);
              }}
              className="rounded-lg border border-border/80 bg-card p-1.5 transition-colors hover:border-primary/40 hover:bg-muted"
            >
              <RotateCw className="size-3.5" />
            </button>
          </span>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40 p-4">
          <div className="relative inline-block max-h-full">
            {error ? (
              <p className="p-10 text-xs text-muted-foreground">{error}</p>
            ) : (
              <>
                <img
                  ref={imgRef}
                  src={source}
                  alt=""
                  draggable={false}
                  className="block max-h-[58vh] max-w-full select-none object-contain"
                />
                {box.w && rect.w ? (
                  <div
                    className="absolute inset-0 touch-none"
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <div
                      onPointerDown={onPointerDown("move")}
                      className="absolute cursor-move shadow-[0_0_0_9999px_hsl(var(--foreground)/0.55)]"
                      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                    >
                      <div className="absolute inset-0 border border-background/90" />
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                        {Array.from({ length: 9 }).map((_, i) => (
                          <div key={i} className="border border-background/25" />
                        ))}
                      </div>
                      {HANDLES.filter((h) => h.corner || !ratio).map((h) => (
                        <span
                          key={h.id}
                          onPointerDown={onPointerDown(h.id)}
                          className={cn(
                            "absolute size-3 rounded-full border-2 border-background bg-primary",
                            h.className,
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
          <p className="font-en text-[11px] text-muted-foreground">
            {image && box.w
              ? `${Math.round((rect.w / box.w) * image.naturalWidth)} × ${Math.round(
                  (rect.h / box.h) * image.naturalHeight,
                )} px`
              : "লোড হচ্ছে…"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
            >
              বাতিল
            </button>
            <button
              type="button"
              disabled={!image || busy || !rect.w}
              onClick={confirm}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              ক্রপ করে সেভ
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
