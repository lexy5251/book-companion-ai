import type { Metadata } from "next";
import { Outfit, Lora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

// Serif reading option for the reader font-family control (--font-serif).
const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Book Companion AI",
  description: "Read dense books with an AI companion — upload an EPUB, highlight, and ask questions as you read.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before React hydrates, so the server/client class attributes differ by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
