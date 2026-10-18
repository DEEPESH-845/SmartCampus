import type { Data } from "./data";
import { day, hourLabel, nf, pairName, rupee } from "./format";

const top = <T,>(xs: T[], by: (x: T) => number) => [...xs].sort((a, b) => by(b) - by(a));

/** Every headline number on the site, derived once from the pipeline outputs. */
export function insights(d: Data) {
  const peak = d.peakHours.map((h) => d.hours.find((x) => x.hour === h)!);
  const byRevenue = top(d.items, (i) => i.revenue), byQuantity = top(d.items, (i) => i.quantity);
  const pairsByCount = top(d.pairs, (p) => p.count * 1e9 + p.revenue);
  const pairsByRevenue = top(d.pairs, (p) => p.revenue * 1e3 + p.count);
  const flagged = top(d.library.students.filter((s) => s.flagged), (s) => s.avg);
  const congested = d.routeHours.filter((r) => r.congested);
  const tally = (key: (r: (typeof congested)[number]) => string) =>
    top(Object.entries(congested.reduce<Record<string, number>>((m, r) => ({ ...m, [key(r)]: (m[key(r)] ?? 0) + 1 }), {})), ([, n]) => n);
  const sessions = d.accessPoints.map((a) => a.sessions), avgs = d.accessPoints.map((a) => a.avgMin);
  const when = (h: string) => `${hourLabel(h.slice(11))}, ${day(h.slice(0, 10))}`;

  return {
    peak, byRevenue, byQuantity, pairsByCount, pairsByRevenue, flagged, congested,
    worstRoutes: tally((r) => r.route).slice(0, 2),
    worstHours: tally((r) => r.hour.slice(11)).slice(0, 4).map(([h]) => h).sort(),
    headline: {
      1: `Wi-Fi peaks at ${when(peak[0].hour)}`,
      2: `Load is spread evenly across the ${d.accessPoints.length} access points`,
      3: `${byQuantity[0].item} sells the most units, but ${byRevenue[0].item} earns the most`,
      4: `${pairName(pairsByCount[0])} is the most common combo`,
      5: `${flagged.length} of ${d.library.students.length} students stay far longer than everyone else`,
      6: "Buses crawl in the morning and evening rush",
      7: `${pairName(pairsByRevenue[0])} earns ${nf(pairsByRevenue[0].revenue / pairsByCount[0].revenue, 1)}× the most frequent pair`,
    } as Record<number, string>,
    stat: {
      1: `${nf(peak[0].dataMB, 1)} MB in ${peak[0].sessions} sessions`,
      2: `${Math.min(...sessions)}–${Math.max(...sessions)} sessions each, ${nf(Math.min(...avgs))}–${nf(Math.max(...avgs))} min average`,
      3: `${byRevenue[0].item} ${rupee(byRevenue[0].revenue)} · ${byQuantity[0].item} ${nf(byQuantity[0].quantity)} units`,
      4: `${pairsByCount[0].count} transactions · ${d.pairs.length} distinct pairs`,
      5: `threshold ${nf(d.library.threshold, 1)} min = 1.5 × ${nf(d.library.average, 1)}`,
      6: `${congested.length} of ${d.routeHours.length} route-hours below 20 km/h`,
      7: `≈ ${rupee(pairsByRevenue[0].revenue)} vs ${rupee(pairsByCount[0].revenue)}`,
    } as Record<number, string>,
    when,
  };
}
