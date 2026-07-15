"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EpubFilePicker from "./EpubFilePicker";
import { getEpubValidationError } from "./epub-file";

type Status = "idle" | "uploading" | "success" | "error";
type UploadResponse = { bookId?: string; error?: string };

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function selectFile(nextFile: File | null) {
    setStatus("idle");
    setError(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    const validationError = getEpubValidationError(nextFile);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }

    setFile(nextFile);
  }

  async function handleUpload() {
    if (!file) return;

    setStatus("uploading");
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/books/upload", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => ({}))) as UploadResponse;

      if (!response.ok) {
        throw new Error(data.error || `Upload failed (${response.status})`);
      }

      setStatus("success");
      if (data.bookId) router.push(`/books/${data.bookId}`);
    } catch (uploadError) {
      setStatus("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
    }
  }

  const uploading = status === "uploading";

  return (
    <div className="w-full max-w-xl">
      <EpubFilePicker
        file={file}
        disabled={uploading}
        onSelect={selectFile}
        onClear={() => selectFile(null)}
      />

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {status === "success" && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300"
        >
          Uploaded. Preparing your book…
        </p>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-base font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#ccc]"
      >
        {uploading && <LoadingSpinner />}
        {uploading ? "Uploading…" : "Upload book"}
      </button>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 animate-spin"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
