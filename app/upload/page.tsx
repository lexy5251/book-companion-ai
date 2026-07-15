import type { Metadata } from "next";
import UploadForm from "./UploadForm";

export const metadata: Metadata = {
  title: "Upload a book · Book Companion AI",
};

export default function UploadPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Upload a book
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Bring an EPUB you own. We&apos;ll open it in a clean reader so you can
            highlight passages and ask questions as you read.
          </p>
        </header>
        <UploadForm />
      </div>
    </main>
  );
}
