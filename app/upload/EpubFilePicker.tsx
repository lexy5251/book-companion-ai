"use client";

import { useRef, useState, type DragEvent } from "react";
import { EPUB_ACCEPT, formatBytes, MAX_EPUB_BYTES } from "./epub-file";

type EpubFilePickerProps = {
  file: File | null;
  disabled: boolean;
  onSelect: (file: File | null) => void;
  onClear: () => void;
};

export default function EpubFilePicker({
  file,
  disabled,
  onSelect,
  onClear,
}: EpubFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    onSelect(event.dataTransfer.files?.[0] ?? null);
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  }

  return (
    <>
      <label
        htmlFor="epub-input"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={disabled ? undefined : handleDrop}
        aria-disabled={disabled}
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors",
          disabled ? "pointer-events-none opacity-60" : "cursor-pointer",
          isDragging
            ? "border-foreground bg-black/[.03] dark:bg-white/[.06]"
            : "border-black/15 hover:border-black/30 dark:border-white/20 dark:hover:border-white/40",
        ].join(" ")}
      >
        <UploadIcon />
        <div className="space-y-1">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
            {isDragging ? "Drop your EPUB to upload" : "Drag & drop your EPUB here"}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            or <span className="underline">click to browse</span> — .epub files only,
            up to {formatBytes(MAX_EPUB_BYTES)}
          </p>
        </div>
        <input
          id="epub-input"
          ref={inputRef}
          type="file"
          accept={EPUB_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
        />
      </label>

      {file && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 dark:border-white/15 dark:bg-zinc-900">
          <FileIcon />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {file.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatBytes(file.size)}
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove file"
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
            >
              <RemoveIcon />
            </button>
          )}
        </div>
      )}
    </>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-10 w-10 text-zinc-400"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-6 w-6 shrink-0 text-zinc-500"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-5 w-5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
