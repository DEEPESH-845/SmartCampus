import type { Metadata } from "next";
import Link from "next/link";
import { HoverTip, NavLinks, ThemeProvider, ThemeToggle } from "@/components/interactive";
import { JOBS } from "@/lib/jobs";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Smart Campus Analytics", template: "%s · Smart Campus Analytics" },
  description: "Results of seven MapReduce jobs (Python, Hadoop Streaming) over a week of synthetic campus Wi-Fi, canteen, library and transport logs.",
};

const links = [{ href: "/", label: "Overview" }, ...JOBS.map((j) => ({ href: `/jobs/${j.id}/`, label: `${j.id} · ${j.short}` }))];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
              <Link href="/" className="shrink-0 text-sm font-semibold">Smart Campus Analytics</Link>
              <nav aria-label="Jobs" className="min-w-0 flex-1"><NavLinks links={links} /></nav>
              <ThemeToggle />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 pt-8 pb-16">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-12 text-[13px] text-faint">
            Built at compile time from the pipeline&apos;s <code className="font-mono">outputs/</code> and <code className="font-mono">src/</code>.
            Synthetic data, seed 42. Source:{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/DEEPESH-845/SmartCampus">github.com/DEEPESH-845/SmartCampus</a>
          </footer>
          <HoverTip />
        </ThemeProvider>
      </body>
    </html>
  );
}
