import { readFileSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import { parseCsv } from "./csv";

// The dashboard is built from the pipeline's own files (run scripts/run_pipeline.py --run-tests first).
const ROOT = path.join(process.cwd(), "..");
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const csv = (name: string) => parseCsv(read("outputs", name));

export type Hour = { hour: string; dataMB: number; durationMin: number; sessions: number };
export type AccessPoint = { ap: string; dataMB: number; durationMin: number; sessions: number; avgMin: number };
export type Item = { item: string; quantity: number; revenue: number };
export type Pair = { a: string; b: string; count: number; priceA: number; priceB: number; revenue: number };
export type Student = { id: string; total: number; visits: number; avg: number; flagged: boolean };
export type RouteHour = { route: string; hour: string; speed: number; readings: number; congested: boolean };
export type Quality = { dataset: string; records: number; valid: number; rejected: number; reasons: Record<string, number> };

export const getData = cache(() => {
  const report = JSON.parse(read("outputs", "validation_report.json"));
  const overall = csv("job5_overall.csv")[0];
  const flagged = new Set(csv("job5_anomalies.csv").map((r) => r.StudentID));
  const students: Student[] = read("outputs", "intermediate", "job5_student_totals.tsv")
    .trim().split("\n").map((line) => {
      const [id, value] = line.split("\t");
      const [total, visits] = value.split(",").map(Number);
      return { id, total, visits, avg: total / visits, flagged: flagged.has(id) };
    });
  const counters: Record<string, Record<string, number>> = report.mapper_counters;
  const quality: Quality[] = (
    [["job1", "wifi"], ["job3", "canteen"], ["job5", "library"], ["job6", "transport"]] as const
  ).map(([job, d]) => {
    const c = counters[job];
    const reasons = Object.fromEntries(
      Object.entries(c).filter(([k]) => k.startsWith(`${d}.rejected.`)).map(([k, v]) => [k.split(".")[2], v]));
    return { dataset: d, records: c[`${d}.records`], valid: c[`${d}.valid`], rejected: c[`${d}.rejected`], reasons };
  });

  return {
    hours: csv("job1_hourly_wifi.csv").map((r): Hour => ({
      hour: r.Hour, dataMB: +r.TotalDataMB, durationMin: +r.TotalDurationMin, sessions: +r.Sessions })),
    peakHours: csv("job1_peak_hours.csv").map((r) => r.Hour),
    accessPoints: csv("job2_access_points.csv").map((r): AccessPoint => ({
      ap: r.AccessPoint, dataMB: +r.TotalDataMB, durationMin: +r.TotalDurationMin, sessions: +r.Sessions,
      avgMin: +r.AvgSessionDurationMin })),
    items: csv("job3_canteen_items.csv").map((r): Item => ({ item: r.Item, quantity: +r.TotalQuantity, revenue: +r.TotalRevenue })),
    pairs: csv("job7_revenue_pairs.csv").map((r): Pair => ({
      a: r.ItemA, b: r.ItemB, count: +r.TransactionCount, priceA: +r.UnitPriceA, priceB: +r.UnitPriceB,
      revenue: +r.EstPairRevenue })),
    library: { students, average: +overall.OverallAverageMin, threshold: +overall.ThresholdMin, visits: +overall.Visits,
      total: +overall.TotalDurationMin },
    routeHours: csv("job6_route_hour_speed.csv").map((r): RouteHour => ({
      route: r.RouteID, hour: r.Hour, speed: +r.AverageSpeedKmph, readings: +r.ObservationCount,
      congested: r.CongestionStatus === "CONGESTED" })),
    quality,
    invariants: report.invariants as { check: string; passed: boolean }[],
    tests: ((report.tests?.summary ?? []) as string[]).join(" "),
  };
});

export type Data = ReturnType<typeof getData>;

export const getSource = (file: string) => read("src", file);
