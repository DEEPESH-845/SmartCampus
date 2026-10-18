"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { ArrowDown, ArrowUp, ArrowUpDown, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</NextThemes>;
}

const subscribe = () => () => {};
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // false during SSR/hydration, true afterwards: avoids a server/client icon mismatch
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const list = useRef<HTMLUListElement>(null);
  // on narrow screens the list scrolls; keep the current page's link visible
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  return (
    <ul ref={list} className="ml-auto flex w-fit max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <li key={l.href}>
            <Link href={l.href} aria-current={active ? "page" : undefined}
              className={cn("block px-2.5 py-1 text-[14px] whitespace-nowrap text-muted-foreground hover:text-foreground",
                active && "text-foreground underline decoration-series-1 decoration-2 underline-offset-[6px]")}>
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** One tooltip for every server-rendered element that carries a data-tip attribute. */
export function HoverTip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    const hide = () => { tip.style.opacity = "0"; };
    const move = (e: PointerEvent) => {
      const t = (e.target as Element).closest?.("[data-tip]") as HTMLElement | null;
      if (!t) return hide();
      tip.textContent = t.dataset.tip ?? "";
      tip.style.opacity = "1";
      const { offsetWidth: w, offsetHeight: h } = tip;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, e.clientX + 14))}px`;
      tip.style.top = `${e.clientY + h + 24 > innerHeight ? e.clientY - h - 14 : e.clientY + 16}px`;
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerdown", move);
    addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", move);
      removeEventListener("scroll", hide);
    };
  }, []);
  return <div ref={ref} role="tooltip"
    className="pointer-events-none fixed z-50 max-w-64 rounded-lg bg-popover px-2.5 py-1.5 text-[12.5px] leading-snug whitespace-pre-line text-popover-foreground opacity-0 transition-opacity duration-75" />;
}

export type Column = { label: string; numeric?: boolean };
export type Row = { cells: string[]; sort: (string | number)[]; flag?: boolean };

/** Sortable table; rows arrive pre-formatted from the server with raw values for sorting. */
export function DataTable({ columns, rows, maxHeight = 360, caption }: {
  columns: Column[]; rows: Row[]; maxHeight?: number | "none"; caption?: string;
}) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = a.sort[sort.col], y = b.sort[sort.col];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, sort]);
  return (
    <div className="overflow-auto rounded-lg border" style={{ maxHeight: maxHeight === "none" ? undefined : maxHeight }}>
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {columns.map((c, i) => {
              const active = sort?.col === i;
              const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
              return (
                <TableHead key={c.label} className={cn(c.numeric && "text-right")}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => setSort({ col: i, dir: active && sort.dir === -1 ? 1 : -1 })}
                    className={cn("inline-flex items-center gap-1 hover:text-foreground", c.numeric && "flex-row-reverse")}>
                    {c.label}<Icon className="size-3 opacity-60" aria-hidden="true" />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r, i) => (
            <TableRow key={i}>
              {r.cells.map((cell, j) => (
                <TableCell key={j} className={cn("tabular", columns[j].numeric && "text-right", r.flag && j === 0 && "font-semibold text-critical")}>
                  {r.flag && j === 0 ? `▲ ${cell}` : cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SourceTabs({ files }: { files: { name: string; code: string }[] }) {
  return (
    <Tabs defaultValue={files[0].name}>
      <TabsList className="w-full justify-start overflow-x-auto [scrollbar-width:thin]">
        {files.map((f) => <TabsTrigger key={f.name} value={f.name} className="flex-none font-mono text-xs">{f.name}</TabsTrigger>)}
      </TabsList>
      {files.map((f) => (
        <TabsContent key={f.name} value={f.name}>
          <pre className="mt-2 max-h-[480px] overflow-auto rounded-lg border bg-background p-4 font-mono text-[12.5px] leading-relaxed"><code>{f.code}</code></pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}
