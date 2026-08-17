"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

// Reader typography preferences (font size + family), shared via context like
// SelectionProvider. Backed by a localStorage-backed external store read through
// useSyncExternalStore — SSR-safe (server renders defaults; the client swaps in
// saved values after hydration) without a setState-in-effect. Theme is handled
// separately by next-themes.
export type FontSize = "sm" | "md" | "lg";
export type FontFamily = "serif" | "sans" | "mono";

// Values written to CSS variables that `.reader-prose` consumes. The `md`/`sans`
// defaults match the reader's original hard-coded look.
const FONT_SIZE_REM: Record<FontSize, string> = {
  sm: "1rem",
  md: "1.125rem",
  lg: "1.3125rem",
};

const FONT_FAMILY_STACK: Record<FontFamily, string> = {
  serif: "var(--font-serif), Georgia, Cambria, serif",
  sans: "var(--font-outfit), ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

const STORAGE_KEY = "reader-settings";

type ReaderSettings = {
  fontSize: FontSize;
  fontFamily: FontFamily;
};

const DEFAULT_SETTINGS: ReaderSettings = { fontSize: "md", fontFamily: "sans" };

function isFontSize(value: unknown): value is FontSize {
  return value === "sm" || value === "md" || value === "lg";
}

function isFontFamily(value: unknown): value is FontFamily {
  return value === "serif" || value === "sans" || value === "mono";
}

// --- localStorage-backed store ---------------------------------------------
// `cached` keeps getSnapshot returning a stable reference (a requirement of
// useSyncExternalStore) between writes.
let cached: ReaderSettings | null = null;
const listeners = new Set<() => void>();

function readStored(): ReaderSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
      return {
        fontSize: isFontSize(parsed.fontSize)
          ? parsed.fontSize
          : DEFAULT_SETTINGS.fontSize,
        fontFamily: isFontFamily(parsed.fontFamily)
          ? parsed.fontFamily
          : DEFAULT_SETTINGS.fontFamily,
      };
    }
  } catch {
    // fall through to defaults on unreadable storage or bad JSON
  }
  return DEFAULT_SETTINGS;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): ReaderSettings {
  if (cached === null) cached = readStored();
  return cached;
}

function getServerSnapshot(): ReaderSettings {
  return DEFAULT_SETTINGS;
}

function writeSettings(patch: Partial<ReaderSettings>): void {
  cached = { ...getSnapshot(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // ignore write failures (quota / private mode); the in-session value holds
  }
  for (const listener of listeners) listener();
}

// --- context ----------------------------------------------------------------
type ReaderSettingsContextValue = ReaderSettings & {
  setFontSize: (size: FontSize) => void;
  setFontFamily: (family: FontFamily) => void;
};

const ReaderSettingsContext = createContext<ReaderSettingsContextValue | null>(
  null,
);

export function useReaderSettings(): ReaderSettingsContextValue {
  const context = useContext(ReaderSettingsContext);
  if (!context) {
    throw new Error(
      "useReaderSettings must be used within a ReaderSettingsProvider",
    );
  }
  return context;
}

export function ReaderSettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Reflect the current settings into the CSS variables `.reader-prose` reads.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--reader-font-size", FONT_SIZE_REM[settings.fontSize]);
    root.setProperty("--reader-font", FONT_FAMILY_STACK[settings.fontFamily]);
  }, [settings.fontSize, settings.fontFamily]);

  return (
    <ReaderSettingsContext.Provider
      value={{
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        setFontSize: (size) => writeSettings({ fontSize: size }),
        setFontFamily: (family) => writeSettings({ fontFamily: family }),
      }}
    >
      {children}
    </ReaderSettingsContext.Provider>
  );
}
