"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/** App-wide client providers. next-themes manages light/dark/system: it writes
 *  the resolved theme as a `class` on <html> (before paint, so there's no flash)
 *  and persists the choice to localStorage. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
