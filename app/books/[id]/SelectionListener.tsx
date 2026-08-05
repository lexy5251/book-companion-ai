"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSelectionContext } from "./SelectionProvider";

// Where to float the "Ask about this" popover, in viewport coordinates (the
// popover is position:fixed). `text` is captured up front so the click still
// works after the browser collapses the live selection.
type Popover = { text: string; x: number; y: number };

// Ignore stray selections (a single accidental click-drag). Below this many
// characters we don't offer the popover.
const MIN_SELECTION_CHARS = 2;

/**
 * Wraps the server-rendered chapter article and watches for text selections
 * inside it. When the reader selects a passage, a floating "Ask about this"
 * button appears; clicking it hands the passage to the chat panel via context.
 * The article stays a server component — it's passed through as `children`.
 */
export default function SelectionListener({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const { attachHighlight } = useSelectionContext();

  useEffect(() => {
    function syncPopoverToSelection() {
      const popover = readSelectionInside(containerRef.current);
      setPopover(popover);
    }

    // mouseup: mouse drag-select. keyup: shift+arrow select. touchend: mobile.
    document.addEventListener("mouseup", syncPopoverToSelection);
    document.addEventListener("keyup", syncPopoverToSelection);
    document.addEventListener("touchend", syncPopoverToSelection);
    return () => {
      document.removeEventListener("mouseup", syncPopoverToSelection);
      document.removeEventListener("keyup", syncPopoverToSelection);
      document.removeEventListener("touchend", syncPopoverToSelection);
    };
  }, []);

  // The popover is anchored to a fixed viewport spot, so any scroll makes its
  // position stale — hide it rather than let it drift.
  useEffect(() => {
    if (!popover) return;
    const hide = () => setPopover(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [popover]);

  // mousedown (not click) + preventDefault keeps the selection alive through the
  // press; we then clear it ourselves so the trailing mouseup hides the popover.
  function handleAsk(event: React.MouseEvent) {
    event.preventDefault();
    if (!popover) return;
    attachHighlight(popover.text);
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div ref={containerRef} className="relative">
      {children}
      {popover && (
        <AskButton x={popover.x} y={popover.y} onMouseDown={handleAsk} />
      )}
    </div>
  );
}

/**
 * Read the current selection and, if it's a non-trivial range living inside
 * `container`, return where to place the popover. Returns null otherwise.
 */
function readSelectionInside(container: HTMLElement | null): Popover | null {
  const selection = window.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const text = selection.toString().trim();
  if (text.length < MIN_SELECTION_CHARS) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const rect = range.getBoundingClientRect();
  // Center under the selection, clamped so the pill never runs off-screen.
  const x = Math.min(Math.max(rect.left + rect.width / 2, 72), window.innerWidth - 72);
  return { text, x, y: rect.bottom };
}

function AskButton({
  x,
  y,
  onMouseDown,
}: {
  x: number;
  y: number;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      style={{ left: x, top: y }}
      className="fixed z-50 inline-flex -translate-x-1/2 translate-y-2 items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 shadow-lg ring-1 ring-black/5 dark:bg-zinc-100 dark:text-zinc-900"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Ask about this
    </button>
  );
}
