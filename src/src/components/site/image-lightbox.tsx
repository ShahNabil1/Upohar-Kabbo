import { cdnImage } from "@/lib/cdn-image";
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type LightboxImage = {
  src: string;
  alt?: string;
};

export function useLightbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [startIndex, setStartIndex] = useState(0);

  const open = useCallback((imgs: LightboxImage[], index = 0) => {
    setImages(imgs);
    setStartIndex(index);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  return useMemo(
    () => ({ isOpen, images, startIndex, open, close }),
    [isOpen, images, startIndex, open, close],
  );
}


export function ImageLightbox({
  images,
  startIndex = 0,
  isOpen,
  onClose,
}: {
  images: LightboxImage[];
  startIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setIndex(startIndex);
    setScale(1);
    setIsZoomed(false);
    setOffset({ x: 0, y: 0 });
  }, [isOpen, startIndex]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const countRef = useRef(images.length);
  countRef.current = images.length;

  useEffect(() => {
    if (!isOpen) {
      setScale(1);
      setIsZoomed(false);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, countRef.current - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", onKey);

    const html = document.documentElement;
    const body = document.body;
    const originalHtmlOverflow = html.style.overflow;
    const originalHtmlScrollBehavior = html.style.scrollBehavior;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyPosition = body.style.position;
    const originalBodyTop = body.style.top;
    const originalBodyWidth = body.style.width;
    const scrollY = window.scrollY;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    const onTouchMove = (e: TouchEvent) => {
      if (e.target === containerRef.current) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", onTouchMove);
      // Disable smooth scrolling so restoring the position is instant, not animated.
      html.style.scrollBehavior = "auto";
      html.style.overflow = originalHtmlOverflow;
      body.style.overflow = originalBodyOverflow;
      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      window.scrollTo(0, scrollY);
      requestAnimationFrame(() => {
        html.style.scrollBehavior = originalHtmlScrollBehavior;
      });
    };
  }, [isOpen]);


  if (!isOpen || images.length === 0) return null;

  const current = images[index];

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) onClose();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.screenX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    const end = e.changedTouches[0]?.screenX;
    touchStartX.current = null;
    if (start == null || end == null || images.length <= 1) return;
    const diff = end - start;
    if (Math.abs(diff) > 50) {
      if (diff < 0) setIndex((i) => Math.min(i + 1, images.length - 1));
      else setIndex((i) => Math.max(i - 1, 0));
      setScale(1);
      setIsZoomed(false);
    }
  };

  const applyScale = (next: number) => {
    const clamped = Math.min(5, Math.max(1, Number(next.toFixed(3))));
    setScale(clamped);
    setIsZoomed(clamped > 1);
    if (clamped === 1) setOffset({ x: 0, y: 0 });
  };

  const toggleZoom = () => applyScale(scale > 1 ? 1 : 2);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    applyScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const onImgTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      pinchRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      dragRef.current = {
        x: e.touches[0]!.clientX - offset.x,
        y: e.touches[0]!.clientY - offset.y,
      };
    }
  };

  const onImgTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      e.stopPropagation();
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      applyScale(pinchRef.current.scale * (dist / pinchRef.current.dist));
    } else if (e.touches.length === 1 && scale > 1 && dragRef.current) {
      e.stopPropagation();
      setOffset({
        x: e.touches[0]!.clientX - dragRef.current.x,
        y: e.touches[0]!.clientY - dragRef.current.y,
      });
    }
  };

  const onImgTouchEnd = () => {
    pinchRef.current = null;
    dragRef.current = null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current || scale <= 1) return;
    setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };

  const endDrag = () => {
    dragRef.current = null;
  };


  const canPrev = index > 0;
  const canNext = index < images.length - 1;

  return createPortal(
    <div
      ref={containerRef}
      onClick={handleBackdropClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      {images.length > 1 ? (
        <button
          type="button"
          disabled={!canPrev}
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => Math.max(i - 1, 0));
            setScale(1);
            setIsZoomed(false);
          }}
          aria-label="Previous image"
          className="absolute left-2 top-1/2 z-10 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-card/90 text-foreground shadow-lg backdrop-blur transition-all hover:bg-primary hover:text-primary-foreground active:scale-95 disabled:opacity-30 sm:left-5"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : null}

      {images.length > 1 ? (
        <button
          type="button"
          disabled={!canNext}
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => Math.min(i + 1, images.length - 1));
            setScale(1);
            setIsZoomed(false);
          }}
          aria-label="Next image"
          className="absolute right-2 top-1/2 z-10 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-card/90 text-foreground shadow-lg backdrop-blur transition-all hover:bg-primary hover:text-primary-foreground active:scale-95 disabled:opacity-30 sm:right-5"
        >
          <ChevronRight className="size-5" />
        </button>
      ) : null}

      <div
        className="relative inline-flex max-h-[86vh] max-w-[92vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {current ? (
          <div
            className="relative overflow-hidden rounded-xl bg-card shadow-2xl ring-1 ring-border/40"
            style={{ touchAction: "none" }}
            onWheel={onWheel}
            onTouchStart={onImgTouchStart}
            onTouchMove={onImgTouchMove}
            onTouchEnd={onImgTouchEnd}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
            <img
              key={current.src}
              src={cdnImage(current.src, { width: 1600, fit: "contain", quality: 88 })}
              alt={current.alt || ""}
              draggable={false}
              onDoubleClick={toggleZoom}
              className={cn(
                "block max-h-[80vh] w-auto max-w-[92vw] select-none object-contain",
                dragRef.current ? "" : "transition-transform duration-200",
                isZoomed ? "cursor-grab" : "cursor-zoom-in",
              )}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />

            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 shadow-lg backdrop-blur">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => applyScale(scale / 1.4)}
                className="grid size-8 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="min-w-10 text-center font-en text-xs font-semibold text-muted-foreground">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => applyScale(scale * 1.4)}
                className="grid size-8 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Reset zoom"
                onClick={() => applyScale(1)}
                className="grid size-8 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="absolute right-2 top-2 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background/70 transition-all hover:bg-primary/90 active:scale-95"
            >
              <X className="size-5" strokeWidth={2.5} />
            </button>

            {current.alt ? (
              <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent px-4 pb-4 pt-10 text-center text-base font-bold leading-snug text-background drop-shadow-md sm:text-lg">
                {current.alt}
              </p>
            ) : null}
          </div>
        ) : null}

        {images.length > 1 ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-full bg-card/95 px-3.5 py-1.5 text-sm font-semibold shadow-lg backdrop-blur">
            <span className="font-en text-primary">{index + 1}</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-en text-muted-foreground">{images.length}</span>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
