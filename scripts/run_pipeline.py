#!/usr/bin/env python3
"""Local Hadoop Streaming simulator for SmartCampusAnalytics.

For every stage: split input into map tasks -> run the real mapper script per task ->
(optional) run the combiner on each task's sorted output -> partition by the first key field (before TAB or '|') ->
sort each partition bytewise -> run the real reducer script per partition -> concatenate.
Any non-zero exit aborts the pipeline (exit 1). Failed validation invariants exit 2.
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
sys.path.insert(0, str(ROOT / "scripts"))
import reference  # noqa: E402

COMBINER = "sum_combiner.py"
DATASETS = {"wifi": "wifi_logs.csv", "canteen": "canteen.csv", "library": "library.csv", "transport": "transport.csv"}
HEADERS = {
    "job1_hourly_wifi.csv": "Hour,TotalDataMB,TotalDurationMin,Sessions",
    "job2_access_points.csv": "AccessPoint,TotalDataMB,TotalDurationMin,Sessions,AvgSessionDurationMin",
    "job3_canteen_items.csv": "Item,TotalQuantity,TotalRevenue",
    "job4_pairs.csv": "ItemA,ItemB,TransactionCount",
    "job5_anomalies.csv": "StudentID,TotalDurationMin,Visits,AverageDurationMin,OverallAverageMin,ThresholdMin",
    "job6_route_hour_speed.csv": "RouteID,Hour,AverageSpeedKmph,ObservationCount,CongestionStatus",
    "job7_revenue_pairs.csv": "ItemA,ItemB,TransactionCount,UnitPriceA,UnitPriceB,EstPairRevenue",
}


class StageError(RuntimeError):
    pass


def run_script(script, data, env=None):
    """Run one streaming script; return (stdout bytes, counters). Raise StageError on failure."""
    cmd = [sys.executable, str(SRC / script)] if not isinstance(script, list) else script
    proc = subprocess.run(cmd, input=data, capture_output=True, env={**os.environ, **(env or {})})
    counters, other = {}, []
    for line in proc.stderr.decode("utf-8", "replace").splitlines():
        if line.startswith("reporter:counter:"):
            _group, name, n = line[len("reporter:counter:"):].rsplit(",", 2)
            counters[name] = counters.get(name, 0) + int(n)
        else:
            other.append(line)
    if proc.returncode != 0:
        raise StageError(f"{' '.join(map(str, cmd[1:] or cmd))} exited with {proc.returncode}: "
                         + "\n".join(other[-5:]))
    if other:
        sys.stderr.write("\n".join(other) + "\n")
    return proc.stdout, counters


def run_stage(mapper, reducer, data, *, map_tasks=1, reducers=1, combiner=False, env=None):
    """Simulate one Hadoop Streaming job on input bytes. Returns (output bytes, mapper counters).

    reducer=None is a map-only job (Hadoop: -numReduceTasks 0): no shuffle, sort or reduce."""
    lines = data.splitlines(keepends=True)
    size = -(-len(lines) // map_tasks) or 1
    splits = [b"".join(lines[i:i + size]) for i in range(0, len(lines), size)] or [b""]
    shuffled, counters = [], {}
    for split in splits:
        out, c = run_script(mapper, split, env)
        for k, v in c.items():
            counters[k] = counters.get(k, 0) + v
        if combiner:
            out, _ = run_script(COMBINER, b"".join(sorted(out.splitlines(keepends=True))))
        shuffled += out.splitlines(keepends=True)
    if reducer is None:
        return b"".join(shuffled), counters
    parts = [[] for _ in range(reducers)]
    for line in shuffled:  # like KeyFieldBasedPartitioner -k1,1 with separator "|" (Job 6: RouteID)
        field = line.split(b"\t", 1)[0].split(b"|", 1)[0]
        parts[zlib.crc32(field) % reducers].append(line)
    outputs = [run_script(reducer, b"".join(sorted(p)), env)[0] for p in parts]
    return b"".join(outputs), counters


def write_csv(path, header, body):
    rows = sorted(body.splitlines(keepends=True))
    path.write_bytes(header.encode() + b"\n" + b"".join(rows))
    return len(rows)


def run_all(data_dir, out_dir, map_tasks=1, reducers=1, combiner=False):
    data_dir, out_dir = Path(data_dir), Path(out_dir)
    inter = out_dir / "intermediate"
    inter.mkdir(parents=True, exist_ok=True)
    raw = {k: (data_dir / f).read_bytes() for k, f in DATASETS.items()}
    opts = dict(map_tasks=map_tasks, reducers=reducers)
    comb = dict(opts, combiner=combiner)
    counters, rows = {}, {}

    def final(name, stage_out):
        rows[name] = write_csv(out_dir / name, HEADERS[name], stage_out)

    out, counters["job1"] = run_stage("job1_wifi_mapper.py", "job1_wifi_reducer.py", raw["wifi"], **comb)
    final("job1_hourly_wifi.csv", out)
    out, counters["job2"] = run_stage("job2_ap_mapper.py", "job2_ap_reducer.py", raw["wifi"], **comb)
    final("job2_access_points.csv", out)
    out, counters["job3"] = run_stage("job3_canteen_mapper.py", "job3_canteen_reducer.py", raw["canteen"], **comb)
    final("job3_canteen_items.csv", out)

    s1, counters["job4"] = run_stage("job4_stage1_mapper.py", "job4_stage1_reducer.py", raw["canteen"], **opts)
    (inter / "job4_stage1_pairs.tsv").write_bytes(s1)
    out, _ = run_stage("job4_stage2_mapper.py", "job4_stage2_reducer.py", s1, **comb)
    final("job4_pairs.csv", out)

    s1, counters["job5"] = run_stage("job5_stage1_mapper.py", "job5_stage1_reducer.py", raw["library"], **comb)
    (inter / "job5_student_totals.tsv").write_bytes(s1)
    glob, _ = run_stage("job5_global_mapper.py", "job5_global_reducer.py", s1, map_tasks=map_tasks, reducers=1)
    global_path = inter / "job5_global.tsv"
    global_path.write_bytes(glob)
    out, _ = run_stage("job5_filter_mapper.py", "job5_filter_reducer.py", s1, **opts,
                       env={"GLOBAL_STATS": str(global_path)})
    final("job5_anomalies.csv", out)

    out, counters["job6"] = run_stage("job6_transport_mapper.py", "job6_transport_reducer.py", raw["transport"], **comb)
    final("job6_route_hour_speed.csv", out)

    # Job 7 (extension): chain Job 3 (side file) and Job 4 (input), map-only
    out, _ = run_stage("job7_revenue_pairs_mapper.py", None, (out_dir / "job4_pairs.csv").read_bytes(),
                       map_tasks=map_tasks, env={"ITEM_STATS": str(out_dir / "job3_canteen_items.csv")})
    final("job7_revenue_pairs.csv", out)

    write_rankings(out_dir, glob)
    return counters, rows


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_rankings(out_dir, global_line):
    """Presentation views of complete reducer outputs (ranking only, no aggregation)."""
    def dump(name, header, rows):
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
        (out_dir / name).write_text(buf.getvalue(), encoding="utf-8")

    hours = read_csv(out_dir / "job1_hourly_wifi.csv")
    # Peak = largest TotalDataMB; tie -> earliest hour. Totals are exact sums printed to 2 dp.
    top = sorted(hours, key=lambda r: (-float(r["TotalDataMB"]), r["Hour"]))[:3]
    dump("job1_peak_hours.csv", ["Rank", "Hour", "TotalDataMB", "TotalDurationMin", "Sessions"],
         [[i + 1, r["Hour"], r["TotalDataMB"], r["TotalDurationMin"], r["Sessions"]] for i, r in enumerate(top)])
    pairs = read_csv(out_dir / "job4_pairs.csv")
    top = sorted(pairs, key=lambda r: (-int(r["TransactionCount"]), r["ItemA"], r["ItemB"]))[:10]
    dump("job4_top_pairs.csv", ["Rank", "ItemA", "ItemB", "TransactionCount"],
         [[i + 1, r["ItemA"], r["ItemB"], r["TransactionCount"]] for i, r in enumerate(top)])
    pairs = read_csv(out_dir / "job7_revenue_pairs.csv")
    top = sorted(pairs, key=lambda r: (-float(r["EstPairRevenue"]), r["ItemA"], r["ItemB"]))[:10]
    dump("job7_top_revenue_pairs.csv", ["Rank", "ItemA", "ItemB", "TransactionCount", "EstPairRevenue"],
         [[i + 1, r["ItemA"], r["ItemB"], r["TransactionCount"], r["EstPairRevenue"]] for i, r in enumerate(top)])
    total, visits, avg = global_line.decode().strip().split("\t")[1].split(",")
    avg_txt = "UNDEFINED" if avg == "UNDEFINED" else f"{float(avg):.2f}"
    thr_txt = "UNDEFINED" if avg == "UNDEFINED" else f"{1.5 * float(avg):.2f}"
    dump("job5_overall.csv", ["TotalDurationMin", "Visits", "OverallAverageMin", "ThresholdMin"],
         [[f"{float(total):.2f}", visits, avg_txt, thr_txt]])


def invariants(data_dir, out_dir, counters):
    """Cross-checks of outputs against counters, each other, and the independent reference."""
    o = Path(out_dir)
    exp = reference.expected(data_dir)
    j1, j2, j3 = (read_csv(o / n) for n in ("job1_hourly_wifi.csv", "job2_access_points.csv", "job3_canteen_items.csv"))
    j4, j5, j6 = (read_csv(o / n) for n in ("job4_pairs.csv", "job5_anomalies.csv", "job6_route_hour_speed.csv"))
    overall = read_csv(o / "job5_overall.csv")[0]
    s = lambda rows, col: round(sum(float(r[col]) for r in rows), 2)  # noqa: E731
    wifi_valid = counters["job1"].get("wifi.valid", 0)
    checks = {
        "every mapper line accounted for (records = valid + rejected)": all(
            c.get(f"{d}.records", 0) == c.get(f"{d}.valid", 0) + c.get(f"{d}.rejected", 0)
            for c in counters.values() for d in DATASETS if f"{d}.records" in c),
        "valid/rejected counts match independent reference": all(
            counters[j].get(f"{d}.valid", 0) == exp["valid"][d] and counters[j].get(f"{d}.rejected", 0) == exp["rejected"][d]
            for j, d in (("job1", "wifi"), ("job3", "canteen"), ("job5", "library"), ("job6", "transport"))),
        "J1 sessions == valid wifi rows": sum(int(r["Sessions"]) for r in j1) == wifi_valid,
        "J2 sessions == valid wifi rows": sum(int(r["Sessions"]) for r in j2) == wifi_valid,
        "J1 DataMB total == J2 DataMB total": s(j1, "TotalDataMB") == s(j2, "TotalDataMB"),
        "J1 DurationMin total == J2 DurationMin total": s(j1, "TotalDurationMin") == s(j2, "TotalDurationMin"),
        "J3 quantity == reference valid quantity": sum(int(r["TotalQuantity"]) for r in j3) == sum(v[0] for v in exp["job3"].values()),
        "J3 revenue == reference valid revenue": s(j3, "TotalRevenue") == round(float(sum(v[1] for v in exp["job3"].values())), 2),
        "J4 pairs canonical (ItemA < ItemB)": all(r["ItemA"] < r["ItemB"] for r in j4),
        "J4 counts <= number of transactions": all(0 < int(r["TransactionCount"]) <= exp["transactions"] for r in j4),
        "J5 visits == valid library rows": int(overall["Visits"]) == counters["job5"].get("library.valid", 0),
        "J5 every anomaly average > threshold": all(
            float(r["TotalDurationMin"]) / int(r["Visits"]) > float(r["ThresholdMin"]) - 0.005 for r in j5),
        # displayed average is rounded; a "20.00" row may be 19.995..19.999 (CONGESTED) - exact check is in reference
        "J6 status agrees with average": all(
            (r["CongestionStatus"] == "CONGESTED") == (float(r["AverageSpeedKmph"]) < 20)
            for r in j6 if r["AverageSpeedKmph"] != "20.00"),
        "J6 observations == valid transport rows": sum(int(r["ObservationCount"]) for r in j6) == counters["job6"].get("transport.valid", 0),
        "J6 hour keys are YYYY-MM-DD-HH": all(len(r["Hour"]) == 13 and r["Hour"][10] == "-" for r in j6),
    }
    mismatches = reference.compare(data_dir, out_dir)
    for job, issues in sorted(mismatches.items()):
        checks[f"{job} every output row matches independent reference"] = not issues
    return [{"check": k, "passed": bool(v)} for k, v in checks.items()], mismatches


def run_tests():
    proc = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests")],
                          capture_output=True, text=True, cwd=ROOT)
    tail = proc.stderr.strip().splitlines()
    return {"exit_code": proc.returncode, "summary": [ln for ln in tail if ln.startswith(("Ran ", "OK", "FAILED"))]}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=ROOT / "data")
    p.add_argument("--out-dir", type=Path, default=ROOT / "outputs")
    p.add_argument("--map-tasks", type=int, default=1, help="input splits / mapper processes per stage")
    p.add_argument("--reducers", type=int, default=1, help="reducer partitions per stage (Job 5 global: always 1)")
    p.add_argument("--combiner", action="store_true", help="run src/sum_combiner.py after each additive mapper")
    p.add_argument("--run-tests", action="store_true", help="also run the unittest suite and record the result")
    a = p.parse_args(argv)
    if a.map_tasks < 1 or a.reducers < 1:
        p.error("--map-tasks and --reducers must be >= 1")
    try:
        counters, rows = run_all(a.data_dir, a.out_dir, a.map_tasks, a.reducers, a.combiner)
    except (StageError, OSError) as e:
        print(f"PIPELINE FAILED: {e}", file=sys.stderr)
        return 1
    checks, mismatches = invariants(a.data_dir, a.out_dir, counters)
    ok = all(c["passed"] for c in checks)
    report = {
        "execution": {"status": "success" if ok else "invariant_failure", "environment": "local simulation (not Hadoop)",
                      "map_tasks": a.map_tasks, "reducers": a.reducers, "combiner": a.combiner},
        "datasets": {d: {"file": f, "lines_excluding_header": max(0, len((a.data_dir / f).read_bytes().splitlines()) - 1)}
                     for d, f in DATASETS.items()},
        "mapper_counters": counters,
        "output_rows": rows,
        "invariants": checks,
        "reference_mismatches": {k: v[:20] for k, v in mismatches.items() if v},
        "known_limitations": [
            "Executed with a local simulator; Hadoop verified separately in standalone mode only (scripts/run_hadoop.sh).",
            "Records are line-oriented; CSV fields with embedded newlines are rejected.",
            "Congestion is an average-speed indicator only.",
        ],
    }
    if a.run_tests:
        report["tests"] = run_tests()
        ok = ok and report["tests"]["exit_code"] == 0
    (a.out_dir / "validation_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for c in checks:
        print(f"[{'PASS' if c['passed'] else 'FAIL'}] {c['check']}")
    print(f"outputs: {a.out_dir}  rows: {rows}")
    if "tests" in report:
        print("tests:", " ".join(report["tests"]["summary"]))
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
