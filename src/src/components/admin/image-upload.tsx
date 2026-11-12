import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Crop as CropIcon, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";

import { createUploadTicket, deleteUploadByUrl } from "@/lib/media.functions";
import { ImageCropperDialog } from "@/components/admin/image-cropper";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * Removing an image must wipe the object from R2 too — otherwise the bucket
 * keeps growing with files nothing links to. Confirms first, deletes the R2
 * object, and only then drops the link from the record.
 */
export function useImageRemover() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const removeImage = useCallback(
    async (url: string | null | undefined, onRemoved: () => void) => {
      if (!url) {
        onRemoved();
        return;
      }
      const ok = await confirm({
        title: "ছবিটি পার্মানেন্টলি ডিলিট হবে?",
        description:
          "R2 বাকেট থেকে ফাইলটি একবারে মুছে যাবে এবং ডাটাবেসের লিংকও সরে যাবে। এটি আর ফেরানো যাবে না।",
        confirmLabel: "Delete permanently",
        tone: "danger",
      });
      if (!ok) return;
      setBusy(true);
      try {
        const res = await deleteUploadByUrl({ data: { url } });
        toast.success(res.deleted ? "R2 থেকে ডিলিট হয়েছে" : "লিংকটি সরানো হয়েছে");
        onRemoved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setBusy(false);
      }
    },
    [confirm],
  );

  return { busy, removeImage };
}

/** Small trash button that deletes the object from R2 and clears the link. */
export function ImageDeleteButton({
  url,
  onRemoved,
  className,
  label,
}: {
  url: string | null | undefined;
  onRemoved: () => void;
  className?: string | undefined;
  label?: string;
}) {
  const { busy, removeImage } = useImageRemover();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void removeImage(url, onRemoved)}
      title="Delete permanently (R2 + link)"
      className={cn(
        "inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60",
        className,
      )}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
      {label}
    </button>
  );
}


type Folder =
  | "products"
  | "sub-products"
  | "categories"
  | "promotions"
  | "landing"
  | "site"
  | "popup"
  | "hero";

const UPLOAD_TYPES = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/gif",
]);

function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const base =
    name
      .slice(0, dot > 0 ? dot : undefined)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  return `${base}${ext || ".jpg"}`;
}

/**
 * Originals go straight to R2 — Cloudflare Image Transformations handle
 * resizing, format and quality at delivery time.
 */
async function uploadOne(file: File, folder: Folder): Promise<string> {
  if (!UPLOAD_TYPES.has(file.type)) throw new Error("এই ফরম্যাটটি সাপোর্ট করে না");
  const contentType = file.type as "image/webp";
  const ticket = await createUploadTicket({
    data: { folder, fileName: safeName(file.name), contentType, size: file.size },
  });
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  toast.success("Uploaded");
  return ticket.publicUrl;
}

export function useImageUpload(folder: Folder) {
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (files: File[]): Promise<string[]> => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return [];
      setBusy(true);
      const urls: string[] = [];
      try {
        for (const file of images) {
          try {
            urls.push(await uploadOne(file, folder));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          }
        }
      } finally {
        setBusy(false);
      }
      return urls;
    },
    [folder],
  );

  return { busy, upload };
}

export function ImageUploadButton({
  folder,
  multiple = false,
  label = "Upload",
  className,
  onUploaded,
}: {
  folder: Folder;
  multiple?: boolean;
  label?: string;
  className?: string | undefined;
  onUploaded: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, upload } = useImageUpload(folder);

  const run = async (files: File[]) => {
    const urls = await upload(files);
    if (urls.length) onUploaded(urls);
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {busy ? "Uploading…" : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          await run(files);
        }}
      />
    </>
  );
}

/** Re-crop an already uploaded image and replace it with the cropped version. */
export function CropExistingButton({
  folder,
  url,
  cropPreset,
  onCropped,
  className,
  children,
}: {
  folder: Folder;
  url: string;
  cropPreset?: string | undefined;
  onCropped: (newUrl: string) => void;
  className?: string | undefined;
  /** Custom trigger (e.g. the image thumbnail itself). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { busy, upload } = useImageUpload(folder);

  if (children) {
    return (
      <>
        <button
          type="button"
          disabled={!url || busy}
          onClick={() => setOpen(true)}
          title="ক্রপ করুন"
          className={cn("block cursor-zoom-in disabled:cursor-default", className)}
        >
          {children}
        </button>
        {open ? (
          <ImageCropperDialog
            src={url}
            initialPreset={cropPreset}
            onCancel={() => setOpen(false)}
            onCropped={async (file) => {
              setOpen(false);
              const urls = await upload([file]);
              if (urls[0]) onCropped(urls[0]);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={!url || busy}
        onClick={() => setOpen(true)}
        title="ক্রপ করুন"
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-border/80 bg-card px-2 py-1 text-[11px] font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <CropIcon className="size-3" />}
        Crop
      </button>
      {open ? (
        <ImageCropperDialog
          src={url}
          initialPreset={cropPreset}
          onCancel={() => setOpen(false)}
          onCropped={async (file) => {
            setOpen(false);
            const urls = await upload([file]);
            if (urls[0]) onCropped(urls[0]);
          }}
        />
      ) : null}
    </>
  );
}

/** Single-image field: drop zone + preview + manual URL entry. */
export function ImageField({
  label,
  folder,
  value,
  onChange,
  hint,
  cropPreset,
}: {
  label: string;
  folder: Folder;
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
  cropPreset?: string | undefined;
}) {
  const { busy, upload } = useImageUpload(folder);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (files: File[]) => {
    const urls = await upload(files.slice(0, 1));
    if (urls[0]) onChange(urls[0]);
  };

  const handleFiles = async (files: File[]) => {
    await run(files);
  };

  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/30 p-2.5 transition-all duration-200",
          dragging && "border-primary bg-primary/5 ig-ring",
        )}
      >
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-card">
          {value ? (
            <CropExistingButton
              folder={folder}
              url={value}
              cropPreset={cropPreset}
              onCropped={(u) => onChange(u)}
              className="size-full"
            >
              <img src={value} alt="" className="size-full object-cover" />
            </CropExistingButton>
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            value={value ?? ""}
            placeholder="https://… or drop a file here"
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary/60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Upload className="size-3" />
              )}
              {busy ? "Uploading…" : "Upload image"}
            </button>
            {value ? (
              <CropExistingButton
                folder={folder}
                url={value}
                cropPreset={cropPreset}
                onCropped={(u) => onChange(u)}
              />
            ) : null}
            {value ? (
              <ImageDeleteButton url={value} onRemoved={() => onChange(null)} label="Delete" />
            ) : null}

          </div>
        </div>
      </div>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          await handleFiles(files);
        }}
      />
    </label>
  );
}
