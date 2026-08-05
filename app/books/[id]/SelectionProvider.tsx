"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

// Shared state between the reading area (where the reader highlights a passage)
// and the chat panel (which asks about it). Kept in context because the two live
// in separate client subtrees under the server-rendered reader layout.
type SelectionContextValue = {
  /** The passage the reader chose to ask about, or null when none is pending. */
  attachedHighlight: string | null;
  /** Attach a highlighted passage — called from the "Ask about this" popover. */
  attachHighlight: (text: string) => void;
  /** Drop the pending passage (dismissed, or consumed by a sent question). */
  clearHighlight: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelectionContext(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelectionContext must be used within a SelectionProvider");
  }
  return context;
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [attachedHighlight, setAttachedHighlight] = useState<string | null>(null);

  const attachHighlight = useCallback((text: string) => {
    setAttachedHighlight(text);
  }, []);

  const clearHighlight = useCallback(() => {
    setAttachedHighlight(null);
  }, []);

  return (
    <SelectionContext.Provider
      value={{ attachedHighlight, attachHighlight, clearHighlight }}
    >
      {children}
    </SelectionContext.Provider>
  );
}
