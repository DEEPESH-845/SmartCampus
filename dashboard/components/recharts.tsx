"use client";

import { CartesianGrid, LabelList, ReferenceArea, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { compact, nf, rupee } from "@/lib/format";

const config = { a: { label: "Series", color: "var(--series-1)" } } satisfies ChartConfig;

function TipBox({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg bg-popover px-2.5 py-1.5 text-[12.5px] leading-snug text-popover-foreground shadow-md">
      {lines.map((l, i) => <div key={i} className={i === 0 ? "font-semibold" : undefined}>{l}</div>)}
    </div>
  );
}

// dots carry a 2px surface ring so overlapping marks stay distinct
const dot = (r: number, fill: string) => function Dot(p: { cx?: number; cy?: number }) {
  return <circle cx={p.cx} cy={p.cy} r={r} fill={fill} stroke="var(--background)" strokeWidth={2} />;
};

export type PairPoint = { name: string; count: number; revenue: number; rankCount: number; rankRevenue: number; highlight: boolean };

// round axis ticks: smallest 1/2/5 x 10^k step giving at most ~5 intervals
function ticks(max: number) {
  const raw = max / 5, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export function PairsScatter({ points }: { points: PairPoint[] }) {
  const xt = ticks(Math.max(...points.map((p) => p.count))), yt = ticks(Math.max(...points.map((p) => p.revenue)));
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full sm:h-[360px]">
      <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis type="number" dataKey="count" domain={[0, xt.at(-1)!]} ticks={xt} tickLine={false} axisLine={{ stroke: "var(--axis)" }}
          label={{ value: "Transactions containing the pair (Job 4) →", position: "insideBottom", offset: -16, fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis type="number" dataKey="revenue" domain={[0, yt.at(-1)!]} ticks={yt} tickLine={false} axisLine={false} width={52}
          tickFormatter={(v: number) => (v ? "₹" + compact(v) : "0")} />
        <ChartTooltip cursor={false} isAnimationActive={false} content={({ active, payload }) => {
          const p = active && payload?.[0]?.payload as PairPoint | undefined;
          return p ? <TipBox lines={[p.name, `${p.count} transactions (rank ${p.rankCount})`, `≈ ${rupee(p.revenue)} estimated revenue (rank ${p.rankRevenue})`]} /> : null;
        }} />
        <Scatter data={points.filter((p) => !p.highlight)} shape={dot(5, "var(--deemph)")} isAnimationActive={false} />
        <Scatter data={points.filter((p) => p.highlight)} shape={dot(6.5, "var(--series-1)")} isAnimationActive={false}>
          <LabelList dataKey="name" position="left" offset={12} fill="var(--foreground)" fontSize={12} fontWeight={600} />
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  );
}

export type StudentPoint = { id: string; avg: number; visits: number; flagged: boolean; jitter: number };

export function LibraryStrip({ students, average, threshold }: { students: StudentPoint[]; average: number; threshold: number }) {
  const heavy = students.filter((s) => s.flagged && s.visits > 1);
  const single = students.filter((s) => s.flagged && s.visits === 1);
  const triangle = (p: { cx?: number; cy?: number }) => (
    <path d={`M${p.cx} ${p.cy! - 6.5} L${p.cx! + 6.5} ${p.cy! + 5} L${p.cx! - 6.5} ${p.cy! + 5} Z`} fill="var(--critical)" stroke="var(--background)" strokeWidth={2} strokeLinejoin="round" />
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <ScatterChart margin={{ top: 22, right: 16, bottom: 8, left: 16 }}>
        <XAxis type="number" dataKey="avg" domain={[0, 300]} ticks={[0, 50, 100, 150, 200, 250, 300]} tickLine={false}
          axisLine={{ stroke: "var(--axis)" }} tickFormatter={(v: number) => `${v} min`} />
        <YAxis type="number" dataKey="jitter" domain={[-0.35, 1.05]} hide />
        {heavy.length > 0 && (
          <ReferenceArea x1={Math.min(...heavy.map((s) => s.avg)) - 4} x2={Math.max(...heavy.map((s) => s.avg)) + 4} y1={-0.3} y2={1.02}
            fill="var(--critical)" fillOpacity={0.06} stroke="none"
            label={{ value: `${heavy.length} heavy readers`, position: "insideBottom", fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
        )}
        <ReferenceLine x={average} stroke="var(--faint)" />
        <ReferenceLine x={threshold} stroke="var(--foreground)" strokeWidth={1.5}
          label={{ value: `1.5 × average = ${nf(threshold, 1)}`, position: "top", fill: "var(--muted-foreground)", fontSize: 11.5 }} />
        <ChartTooltip cursor={false} isAnimationActive={false} content={({ active, payload }) => {
          const s = active && payload?.[0]?.payload as StudentPoint | undefined;
          return s ? <TipBox lines={[`${s.id}${s.flagged ? " · flagged" : ""}`, `Average ${nf(s.avg, 1)} min over ${s.visits} visit${s.visits > 1 ? "s" : ""}`]} /> : null;
        }} />
        <Scatter data={students.filter((s) => !s.flagged)} shape={dot(4, "var(--series-1)")} isAnimationActive={false} />
        <Scatter data={students.filter((s) => s.flagged)} shape={triangle} isAnimationActive={false}>
          {single.length > 0 && (
            <LabelList dataKey="id" position="right" offset={10} fill="var(--foreground)" fontSize={12} fontWeight={600}
              formatter={(id: unknown) => (single.some((s) => s.id === id) ? `${id} · 1 visit` : "")} />
          )}
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  );
}
