"use client";

import type { CSSProperties, ReactNode, SyntheticEvent } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  useReaderSettings,
  type FontFamily,
  type FontSize,
} from "./ReaderSettingsProvider";

const THEME_OPTIONS: { value: string; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const FONT_OPTIONS: { value: FontFamily; label: string; previewFont: string }[] =
  [
    { value: "serif", label: "Serif", previewFont: "var(--font-serif), Georgia, serif" },
    { value: "sans", label: "Sans", previewFont: "var(--font-outfit), sans-serif" },
    { value: "mono", label: "Mono", previewFont: "ui-monospace, Menlo, monospace" },
  ];

const SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

// Closes the native <details> popover when the user clicks (or taps) anywhere
// outside it. The <details> stays uncontrolled — we only listen while it's open
// and flip `open` on the element itself, which keeps the native summary toggle.
function useCloseOnOutsideClick() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (details && !details.contains(event.target as Node)) {
        details.open = false;
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    setOpen(event.currentTarget.open);
  }

  return { detailsRef, handleToggle };
}

// true only after client mount, without a setState-in-effect (SSR-safe). Used to
// avoid a hydration mismatch: the resolved theme is unknown during SSR.
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function OptionButton({
  active,
  onClick,
  style,
  children,
}: {
  active: boolean;
  onClick: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={style}
      className={[
        "flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SettingRow({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1.5 px-0 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {legend}
      </legend>
      <div className="flex gap-1">{children}</div>
    </fieldset>
  );
}

/** The "Aa" reading-settings popover: theme, font family, and text size. Uses a
 *  native <details> for open/close (JS-free, matching the reader's TOC drawer).
 *  Theme is handled by next-themes; font family + size by ReaderSettingsProvider. */
export default function ReaderSettingsControl() {
  const { fontSize, setFontSize, fontFamily, setFontFamily } =
    useReaderSettings();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const activeTheme = mounted ? theme : undefined;
  const { detailsRef, handleToggle } = useCloseOnOutsideClick();

  return (
    <details ref={detailsRef} onToggle={handleToggle} className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-0.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700"
        aria-label="Reading settings"
        title="Reading settings"
      >
        <span className="text-base font-semibold leading-none">A</span>
        <span className="text-xs leading-none">a</span>
      </summary>

      <div className="absolute right-0 z-10 mt-2 w-64 space-y-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
        <SettingRow legend="Theme">
          {THEME_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={option.value === activeTheme}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </OptionButton>
          ))}
        </SettingRow>

        <SettingRow legend="Font">
          {FONT_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={option.value === fontFamily}
              onClick={() => setFontFamily(option.value)}
              style={{ fontFamily: option.previewFont }}
            >
              {option.label}
            </OptionButton>
          ))}
        </SettingRow>

        <SettingRow legend="Text size">
          {SIZE_OPTIONS.map((option) => (
            <OptionButton
              key={option.value}
              active={option.value === fontSize}
              onClick={() => setFontSize(option.value)}
            >
              {option.label}
            </OptionButton>
          ))}
        </SettingRow>
      </div>
    </details>
  );
}
