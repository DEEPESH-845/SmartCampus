import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/jobs";

/* ---------- heatmap (CSS grid, server-rendered; colours are CSS variables so themes switch without JS) */
export type HeatCell = { kind: "value"; level: number; tip: string; mark?: boolean } | { kind: "zero" | "empty"; tip: string };

export function Heatmap({ rows, cols, cells, ramp, label, colEvery = 1 }: {
  rows: string[]; cols: string[]; cells: HeatCell[][]; ramp: "seq" | "ord"; label: string; colEvery?: number;
}) {
  return (
    <div role="img" aria-label={label} className="grid items-center gap-0.5 text-[11.5px]"
      style={{ gridTemplateColumns: `max-content repeat(${cols.length}, minmax(0, 1fr))` }}>
      {rows.map((r, i) => [
        <div key={`r${r}`} className="pr-2 whitespace-nowrap text-muted-foreground">{r}</div>,
        ...cells[i].map((c, j) => (
          <div key={`${r}-${j}`} data-tip={c.tip}
            className={cn("h-7 rounded-[3px]",
              c.kind === "empty" && "border border-dashed border-border",
              c.kind === "zero" && "bg-muted",
              c.kind === "value" && c.mark && "outline-2 -outline-offset-2 outline-foreground")}
            style={c.kind === "value" ? { background: `var(--${ramp}-${c.level})` } : undefined} />
        )),
      ])}
      <div />
      {cols.map((c, j) => (
        <div key={`c${c}`} className="pt-1 text-center tabular text-faint">{j % colEvery === 0 ? c : ""}</div>
      ))}
    </div>
  );
}

/* ---------- horizontal bar list (one series per colour token; 4px rounded data-end) */
export type Bar = { name: string; value: number; label: string; tip: string; tone?: "series-1" | "series-2" | "deemph" };

export function BarList({ bars, max }: { bars: Bar[]; max: number }) {
  return (
    <div className="grid grid-cols-[max-content_1fr_max-content] items-center gap-x-2.5 gap-y-1.5 text-[13px]">
      {bars.map((b) => [
        <div key={`n${b.name}`} className="max-w-40 truncate text-muted-foreground" title={b.name}>{b.name}</div>,
        <div key={`b${b.name}`} className="h-3.5" data-tip={b.tip}>
          <div className="h-full min-w-0.5 rounded-r-[4px]"
            style={{ width: `${(b.value / max) * 100}%`, background: `var(--${b.tone ?? "series-1"})` }} />
        </div>,
        <div key={`v${b.name}`} className="text-right tabular text-muted-foreground">{b.label}</div>,
      ])}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "dot" | "square" | "triangle" | "line" }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.shape === "triangle"
            ? <svg width="12" height="12" aria-hidden="true"><path d="M6 1 L11 11 L1 11 Z" fill={i.color} /></svg>
            : i.shape === "line" ? <i className="inline-block h-3 w-0.5" style={{ background: i.color }} />
            : <i className={cn("inline-block size-2.5", i.shape === "dot" ? "rounded-full" : "rounded-[2px]")} style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- page furniture */
export function Section({ id, eyebrow, title, children, className }: {
  id?: string; eyebrow?: string; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)}>
      {eyebrow && <p className="mb-1 text-xs font-medium tracking-wide text-faint uppercase">{eyebrow}</p>}
      <h2 className="mb-2 text-xl font-semibold leading-snug">{title}</h2>
      {children}
    </section>
  );
}

export function Takeaway({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border-l-[3px] border-series-1 py-0.5 pl-3 text-sm text-muted-foreground">{children}</p>;
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.86em]">{children}</code>;
}

export function StageFlow({ input, stages, output }: { input: string; stages: Stage[]; output: string }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-2 text-[13px]">
      <li className="flex items-center rounded-lg border border-dashed px-3 py-2 text-muted-foreground">{input}</li>
      {stages.map((s, i) => (
        <li key={s.name} className="flex items-center gap-2">
          <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
          <div className="rounded-lg border bg-background px-3 py-2">
            <div className="font-medium">{stages.length > 1 ? `Stage ${i + 1}: ` : ""}{s.name}</div>
            <div className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">{s.key} → {s.value}</div>
          </div>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
        <div className="rounded-lg border border-dashed px-3 py-2 text-muted-foreground">{output}</div>
      </li>
    </ol>
  );
}

export function Checks({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-1.5 rounded-full border bg-card py-1 pr-3 pl-2 text-[13px] text-muted-foreground">
          <CircleCheck className="size-4 text-good" aria-hidden="true" />{t}
        </li>
      ))}
    </ul>
  );
}

export function Tile({ href, label, value, sub }: { href: string; label: string; value: string; sub: string }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-axis">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="my-0.5 text-[22px] leading-tight font-semibold">{value}</div>
      <div className="text-[12.5px] text-faint">{sub}</div>
    </Link>
  );
}
