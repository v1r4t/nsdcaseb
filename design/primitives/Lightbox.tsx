import { useEffect } from "react";
import { Dialog } from "./Dialog";
import { DrawnPlaceholder } from "./DrawnPlaceholder";
export interface MediaItem {
  id: string;
  kind: "image" | "video";
  src: string;
  caption: string;
  alt: string;
}

export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const open = Boolean(item);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, items.length, onIndex]);

  if (!item) return null;

  return (
    <Dialog open onClose={onClose} title={item.caption} width="max-w-3xl">
      <DrawnPlaceholder
        caption={item.caption}
        alt={item.alt}
        ratio="aspect-[3/2]"
        anchor={String(index + 1).padStart(2, "0")}
      />
      <div className="mt-5 flex items-center justify-between">
        <span className="mono text-faint" aria-live="polite">
          {index + 1} / {items.length}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="mono min-h-11 border px-4 hairline text-faint transition-colors hover:text-ink"
            onClick={() => onIndex((index - 1 + items.length) % items.length)}
          >
            ← Prev
          </button>
          <button
            type="button"
            className="mono min-h-11 border px-4 hairline text-faint transition-colors hover:text-ink"
            onClick={() => onIndex((index + 1) % items.length)}
          >
            Next →
          </button>
        </div>
      </div>
    </Dialog>
  );
}
