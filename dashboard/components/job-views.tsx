import type { Data } from "@/lib/data";
import { compact, day, hourLabel, nf, pairName, rupee } from "@/lib/format";
import { insights } from "@/lib/insights";
import { DataTable, type Column, type Row } from "@/components/interactive";
import { LibraryStrip, PairsScatter } from "@/components/recharts";
import { BarList, Heatmap, Legend, Takeaway, type Bar, type HeatCell } from "@/components/visuals";

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">{children}</h3>;
const niceMax = (v: number) => { const m = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / m) * m; };
const uniq = (xs: string[]) => [...new Set(xs)].sort();

function WifiHeatmap({ d }: { d: Data }) {
  const days = uniq(d.hours.map((h) => h.hour.slice(0, 10))), hours = uniq(d.hours.map((h) => h.hour.slice(11)));
  const by = new Map(d.hours.map((h) => [h.hour, h]));
  const max = Math.max(...d.hours.map((h) => h.dataMB));
  const cells: HeatCell[][] = days.map((dd) => hours.map((hh): HeatCell => {
    const h = by.get(`${dd}-${hh}`);
    if (!h) return { kind: "empty", tip: `${day(dd)} · ${hourLabel(hh)}\nNo sessions` };
    const rank = d.peakHours.indexOf(h.hour);
    return {
      kind: "value", level: Math.min(12, Math.floor((h.dataMB / max) * 13)), mark: rank === 0,
      tip: `${day(dd)} · ${hourLabel(hh)}–${hh}:59${rank >= 0 ? `\nRank ${rank + 1} of ${d.hours.length} hours` : ""}\n${nf(h.dataMB, 1)} MB · ${h.sessions} sessions · ${nf(h.durationMin)} min`,
    };
  }));
  return (
    <>
      <Heatmap rows={days.map(day)} cols={hours} cells={cells} ramp="seq" colEvery={2} label="Wi-Fi data per hour and day" />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-faint">
        <span>0 MB</span>
        <span className="h-2 w-40 rounded-[2px]" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => `var(--seq-${i})`).join(",")})` }} />
        <span>{nf(max)} MB</span><span>· outlined: peak hour</span>
      </div>
    </>
  );
}

function CongestionHeatmap({ d }: { d: Data }) {
  const routes = uniq(d.routeHours.map((r) => r.route)), hours = uniq(d.routeHours.map((r) => r.hour.slice(11)));
  const agg = new Map<string, { days: number; cong: number; sum: number; n: number }>();
  for (const r of d.routeHours) {
    const k = `${r.route}|${r.hour.slice(11)}`, a = agg.get(k) ?? { days: 0, cong: 0, sum: 0, n: 0 };
    a.days++; a.cong += +r.congested; a.sum += r.speed * r.readings; a.n += r.readings; agg.set(k, a);
  }
  const cells: HeatCell[][] = routes.map((r) => hours.map((h): HeatCell => {
    const a = agg.get(`${r}|${h}`);
    if (!a) return { kind: "empty", tip: `${r} · ${hourLabel(h)}\nNo readings` };
    const tip = `${r} · ${hourLabel(h)}–${h}:59\nCongested on ${a.cong} of ${a.days} days\nWeek average ${nf(a.sum / a.n, 1)} km/h (${a.n} readings)`;
    if (a.cong === 0) return { kind: "zero", tip };
    return { kind: "value", level: a.cong === 1 ? 0 : a.cong <= 3 ? 1 : a.cong <= 6 ? 2 : 3, tip };
  }));
  return (
    <>
      <Heatmap rows={routes} cols={hours} cells={cells} ramp="ord" label="Congested days per route and hour" />
      <div className="mt-3">
        <Legend items={[{ label: "Never", color: "var(--muted)" },
          ...["1 day", "2–3 days", "4–6 days", "Every day"].map((label, i) => ({ label, color: `var(--ord-${i})` }))]} />
      </div>
    </>
  );
}

const itemTip = (i: Data["items"][number]) => `${i.item}\n${nf(i.quantity)} units · ${rupee(i.revenue)}\nAverage price ${rupee(i.revenue / i.quantity)}`;

/** The result block of a job page: chart(s) plus the one-sentence interpretation. */
export function JobResult({ id, d }: { id: number; d: Data }) {
  const x = insights(d);
  switch (id) {
    case 1:
      return (
        <>
          <p className="mb-4 text-muted-foreground">Total data downloaded in each hour of the week. Darker means more data.</p>
          <WifiHeatmap d={d} />
          <Takeaway>Top three hours: {x.peak.map((h) => `${x.when(h.hour)} (${nf(h.dataMB)} MB)`).join("; ")}. Demand concentrates in late morning and early afternoon, so capacity should be planned for these peaks, not the daily average.</Takeaway>
        </>
      );
    case 2: {
      const bars: Bar[] = [...d.accessPoints].sort((a, b) => b.dataMB - a.dataMB).map((a) => ({
        name: a.ap, value: a.dataMB, label: `${nf(a.dataMB / 1000, 1)}K MB`,
        tip: `${a.ap}\n${nf(a.dataMB, 1)} MB · ${a.sessions} sessions\nAverage session ${nf(a.avgMin, 1)} min` }));
      return (
        <>
          <p className="mb-4 text-muted-foreground">Total data per access point for the week. Hover a bar for sessions and average session length.</p>
          <BarList bars={bars} max={niceMax(bars[0].value)} />
          <Takeaway>Every access point handled {x.stat[2]}. No hotspot stands out in this synthetic data, because the generator assigns access points uniformly; with real logs the same job would reveal overloaded rooms.</Takeaway>
        </>
      );
    }
    case 3: {
      const tone = (name: string): Bar["tone"] => name === x.byRevenue[0].item ? "series-1" : name === x.byQuantity[0].item ? "series-2" : "deemph";
      const units: Bar[] = x.byQuantity.map((i) => ({ name: i.item, value: i.quantity, label: nf(i.quantity), tip: itemTip(i), tone: tone(i.item) }));
      const rev: Bar[] = x.byRevenue.map((i) => ({ name: i.item, value: i.revenue, label: compact(i.revenue), tip: itemTip(i), tone: tone(i.item) }));
      return (
        <>
          <p className="mb-4 text-muted-foreground">The same twelve items ranked two ways. Volume and value tell different stories.</p>
          <Legend items={[{ label: x.byRevenue[0].item, color: "var(--series-1)" }, { label: x.byQuantity[0].item, color: "var(--series-2)" }, { label: "Other items", color: "var(--deemph)" }]} />
          <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <div><H3>Units sold</H3><BarList bars={units} max={niceMax(units[0].value)} /></div>
            <div><H3>Revenue (₹)</H3><BarList bars={rev} max={niceMax(rev[0].value)} /></div>
          </div>
          <Takeaway>{x.byQuantity[0].item} ({nf(x.byQuantity[0].quantity)} units) and {x.byQuantity[1].item} sell the most, but {x.byRevenue[0].item} earns the most ({rupee(x.byRevenue[0].revenue)}) because of its higher price. Stock planning should follow quantity; pricing and promotions should follow revenue.</Takeaway>
        </>
      );
    }
    case 4: {
      const top = x.pairsByCount.slice(0, 10);
      const bars: Bar[] = top.map((p, i) => ({ name: pairName(p), value: p.count, label: nf(p.count), tone: i < 2 ? "series-1" : "deemph",
        tip: `${pairName(p)}\nBought together in ${p.count} transactions` }));
      return (
        <>
          <p className="mb-4 text-muted-foreground">The ten pairs of different items most often bought in the same transaction.</p>
          <BarList bars={bars} max={niceMax(bars[0].value)} />
          <Takeaway>Two combos dominate: {pairName(x.pairsByCount[0])} ({x.pairsByCount[0].count} transactions) and {pairName(x.pairsByCount[1])} ({x.pairsByCount[1].count}). No other pair appears in more than {x.pairsByCount[2].count}. These are the natural meal-deal candidates; Job 7 shows which one is worth more.</Takeaway>
        </>
      );
    }
    case 5: {
      const students = d.library.students.map((s, i) => ({ id: s.id, avg: s.avg, visits: s.visits, flagged: s.flagged, jitter: ((i * 2654435761) % 1000) / 1000 }));
      const single = x.flagged.find((s) => s.visits === 1);
      return (
        <>
          <p className="mb-4 text-muted-foreground">Each mark is one student&apos;s average visit length. Students right of the threshold (1.5 × the overall average) are flagged.</p>
          <Legend items={[{ label: "Within normal range", color: "var(--series-1)", shape: "dot" }, { label: "Flagged (above threshold)", color: "var(--critical)", shape: "triangle" },
            { label: `Overall average ${nf(d.library.average, 1)} min`, color: "var(--faint)", shape: "line" },
            { label: `Threshold ${nf(d.library.threshold, 1)} min`, color: "var(--foreground)", shape: "line" }]} />
          <LibraryStrip students={students} average={d.library.average} threshold={d.library.threshold} />
          <Takeaway>Overall average {nf(d.library.average, 2)} min over {nf(d.library.visits)} visits, so the threshold is {nf(d.library.threshold, 2)} min. {single ? `${single.id} is flagged from a single ${nf(single.avg)}-minute visit, which is weak evidence; a minimum visit count would make the rule sturdier. ` : ""}Flags are prompts for review, not conclusions.</Takeaway>
        </>
      );
    }
    case 6:
      return (
        <>
          <p className="mb-4 text-muted-foreground">For each route and hour of the day: on how many days of the week was the average speed below 20 km/h?</p>
          <CongestionHeatmap d={d} />
          <Takeaway>{x.congested.length} of {d.routeHours.length} route-hours were congested. The worst routes are {x.worstRoutes.map(([r, n]) => `${r} (${n})`).join(" and ")}; the worst hours are {x.worstHours.map(hourLabel).join(", ")}. Below 20 km/h is an indicator only: it cannot tell traffic from scheduled stops.</Takeaway>
        </>
      );
    case 7: {
      const hi = new Set([x.pairsByCount[0], x.pairsByRevenue[0]]);
      const points = d.pairs.map((p) => ({ name: pairName(p), count: p.count, revenue: p.revenue, highlight: hi.has(p),
        rankCount: x.pairsByCount.indexOf(p) + 1, rankRevenue: x.pairsByRevenue.indexOf(p) + 1 }));
      const rank = (list: Data["pairs"]): Row[] => list.slice(0, 5).map((p, i) => ({
        cells: [String(i + 1), pairName(p), nf(p.count), rupee(p.revenue)], sort: [i + 1, pairName(p), p.count, p.revenue] }));
      const cols: Column[] = [{ label: "#", numeric: true }, { label: "Pair" }, { label: "Txns", numeric: true }, { label: "Revenue", numeric: true }];
      const [f, v] = [x.pairsByCount[0], x.pairsByRevenue[0]];
      return (
        <>
          <p className="mb-4 text-muted-foreground">Each dot is one pair: how often it is bought (Job 4) against the revenue it brings at average prices (Job 7).</p>
          <Legend items={[{ label: "Highlighted pair", color: "var(--series-1)", shape: "dot" }, { label: "Other pairs", color: "var(--deemph)", shape: "dot" }]} />
          <PairsScatter points={points} />
          <div className="mt-2 grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <div><H3>Top 5 by frequency (Job 4)</H3><DataTable columns={cols} rows={rank(x.pairsByCount)} maxHeight="none" /></div>
            <div><H3>Top 5 by estimated revenue (Job 7)</H3><DataTable columns={cols} rows={rank(x.pairsByRevenue)} maxHeight="none" /></div>
          </div>
          <Takeaway>{pairName(f)} appears in the most baskets ({f.count}), but {pairName(v)} earns about {nf(v.revenue / f.revenue, 1)}× as much ({rupee(v.revenue)} vs {rupee(f.revenue)}). A meal deal on {pairName(v)} protects the most revenue; one on {pairName(f)} mainly drives footfall. Revenue is estimated as transactions × (unit price A + unit price B).</Takeaway>
        </>
      );
    }
  }
  return null;
}

/** Full output table for a job, pre-formatted on the server with raw sort keys. */
export function jobTable(id: number, d: Data): { columns: Column[]; rows: Row[] } {
  const n = (label: string): Column => ({ label, numeric: true });
  switch (id) {
    case 1: return { columns: [{ label: "Hour" }, n("Data (MB)"), n("Duration (min)"), n("Sessions")],
      rows: d.hours.map((h) => ({ cells: [h.hour, nf(h.dataMB, 2), nf(h.durationMin, 2), nf(h.sessions)], sort: [h.hour, h.dataMB, h.durationMin, h.sessions] })) };
    case 2: return { columns: [{ label: "Access point" }, n("Data (MB)"), n("Duration (min)"), n("Sessions"), n("Avg session (min)")],
      rows: d.accessPoints.map((a) => ({ cells: [a.ap, nf(a.dataMB, 2), nf(a.durationMin, 2), nf(a.sessions), nf(a.avgMin, 2)], sort: [a.ap, a.dataMB, a.durationMin, a.sessions, a.avgMin] })) };
    case 3: return { columns: [{ label: "Item" }, n("Units"), n("Revenue (₹)"), n("Avg price (₹)")],
      rows: d.items.map((i) => ({ cells: [i.item, nf(i.quantity), nf(i.revenue, 2), nf(i.revenue / i.quantity, 2)], sort: [i.item, i.quantity, i.revenue, i.revenue / i.quantity] })) };
    case 4: return { columns: [{ label: "Item A" }, { label: "Item B" }, n("Transactions")],
      rows: d.pairs.map((p) => ({ cells: [p.a, p.b, nf(p.count)], sort: [p.a, p.b, p.count] })) };
    case 5: {
      const { average } = d.library;
      return { columns: [{ label: "Student" }, n("Total (min)"), n("Visits"), n("Avg visit (min)"), n("× overall avg")],
        rows: d.library.students.map((s) => ({ flag: s.flagged, cells: [s.id, nf(s.total), nf(s.visits), nf(s.avg, 2), nf(s.avg / average, 2) + "×"], sort: [s.id, s.total, s.visits, s.avg, s.avg / average] })) };
    }
    case 6: return { columns: [{ label: "Route" }, { label: "Hour" }, n("Avg speed (km/h)"), n("Readings"), { label: "Status" }],
      rows: d.routeHours.map((r) => ({ flag: r.congested, cells: [r.route, r.hour, nf(r.speed, 2), nf(r.readings), r.congested ? "Congested" : "Not congested"], sort: [r.route, r.hour, r.speed, r.readings, +r.congested] })) };
    case 7: return { columns: [{ label: "Item A" }, { label: "Item B" }, n("Transactions"), n("Price A (₹)"), n("Price B (₹)"), n("Est. revenue (₹)")],
      rows: d.pairs.map((p) => ({ cells: [p.a, p.b, nf(p.count), nf(p.priceA, 2), nf(p.priceB, 2), nf(p.revenue, 2)], sort: [p.a, p.b, p.count, p.priceA, p.priceB, p.revenue] })) };
  }
  return { columns: [], rows: [] };
}

export const OUTPUT_FILE: Record<number, string> = {
  1: "job1_hourly_wifi.csv", 2: "job2_access_points.csv", 3: "job3_canteen_items.csv", 4: "job4_pairs.csv",
  5: "job5_anomalies.csv", 6: "job6_route_hour_speed.csv", 7: "job7_revenue_pairs.csv",
};
