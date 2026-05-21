import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relayer - Messenger Chat App",
  description: "A fast, clean serverless chat workspace built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}