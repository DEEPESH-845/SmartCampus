import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { HoverTip, NavLinks, ThemeProvider, ThemeToggle } from "@/components/interactive";
import { JOBS } from "@/lib/jobs";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "Smart Campus Analytics", template: "%s | Smart Campus Analytics" },
  description: "Results of seven MapReduce jobs (Python, Hadoop Streaming) over a week of synthetic campus Wi-Fi, canteen, library and transport logs.",
};

const links = [{ href: "/", label: "Overview" }, ...JOBS.map((j) => ({ href: `/jobs/${j.id}/`, label: j.short }))];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body>
        <ThemeProvider>
          <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
              <Link href="/" className="display shrink-0 text-[17px] font-semibold">Smart Campus</Link>
              <nav aria-label="Pages" className="min-w-0 flex-1"><NavLinks links={links} /></nav>
              <ThemeToggle />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">{children}</main>
          <footer className="mx-auto max-w-6xl border-t px-5 py-10 text-[13px] text-faint sm:px-8">
            Built from the pipeline&apos;s outputs and source code. Synthetic data, seed 42.{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/DEEPESH-845/SmartCampus">Source on GitHub</a>
          </footer>
          <HoverTip />
        </ThemeProvider>
      </body>
    </html>
  );
}
