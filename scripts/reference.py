"""Independent reference implementation of all six jobs (no MapReduce, no code from src/).

Used by the tests and the validation report to check the streaming outputs. It uses its own
regex-based validation and exact Fraction arithmetic. It deliberately accepts only plain
decimals (no exponents/signs), so compare it with the streaming jobs on generated data only.
"""
import csv
import re
from collections import defaultdict
from datetime import datetime
from fractions import Fraction
from pathlib import Path

TS = re.compile(r"(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)")
NUM = re.compile(r"\d+(\.\d+)?")
INT = re.compile(r"\d+")
TOL = Fraction(1, 200)  # outputs are rounded to 2 decimals


def _hour(s):
    m = TS.fullmatch(s)
    if not m:
        return None
    try:
        datetime(*map(int, m.groups()))
    except ValueError:
        return None
    return f"{m[1]}-{m[2]}-{m[3]}-{m[4]}"


def _rows(path, n, numeric, integer=()):
    """Return (valid rows with hour in column 1 and numbers as Fractions, rejected count)."""
    valid, rejected = [], 0
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()[1:]  # generated files always start with the header
    for line in lines:
        try:
            row = [x.strip() for x in next(csv.reader([line], strict=True))]
        except csv.Error:
            rejected += 1
            continue
        if (len(row) != n or not all(row) or _hour(row[1]) is None
                or not all(NUM.fullmatch(row[i]) for i in numeric)
                or not all(INT.fullmatch(row[i]) for i in integer)):
            rejected += 1
            continue
        row[1] = _hour(row[1])
        for i in numeric:
            row[i] = Fraction(row[i])
        valid.append(row)
    return valid, rejected


def expected(data_dir):
    d = Path(data_dir)
    wifi, wifi_bad = _rows(d / "wifi_logs.csv", 5, (3, 4))
    canteen, canteen_bad = _rows(d / "canteen.csv", 6, (4, 5), integer=(4,))
    library, library_bad = _rows(d / "library.csv", 4, (3,))
    library_bad += sum(r[2] != "ENTRY" for r in library)
    library = [r for r in library if r[2] == "ENTRY"]
    transport, transport_bad = _rows(d / "transport.csv", 4, (3,))

    def totals(rows, key, cols):
        acc = defaultdict(lambda: [Fraction(0)] * (len(cols) + 1))
        for r in rows:
            t = acc[key(r)]
            for j, c in enumerate(cols):
                t[j] += r[c]
            t[-1] += 1
        return dict(acc)

    job1 = totals(wifi, lambda r: r[1], (3, 4))                     # [data, dur, n]
    job2 = {k: v + [v[1] / v[2]] for k, v in totals(wifi, lambda r: r[2], (3, 4)).items()}
    job3 = {k: v[:2] for k, v in totals(canteen, lambda r: r[3], (4, 5)).items()}
    baskets = defaultdict(set)
    for r in canteen:
        baskets[r[0]].add(r[3])
    job4 = defaultdict(int)
    for items in baskets.values():
        items = sorted(items)
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                job4[(items[i], items[j])] += 1
    students = totals(library, lambda r: r[0], (3,))                # [total, visits]
    g_total = sum(v[0] for v in students.values())
    g_visits = sum(v[1] for v in students.values())
    overall = g_total / g_visits if g_visits else None
    job5 = {s: v for s, v in students.items() if overall is not None and v[0] / v[1] > Fraction(3, 2) * overall}
    job6 = {k: [v[0] / v[1], v[1], v[0] / v[1] < 20]
            for k, v in totals(transport, lambda r: (r[2], r[1]), (3,)).items()}
    return {
        "valid": {"wifi": len(wifi), "canteen": len(canteen), "library": len(library), "transport": len(transport)},
        "rejected": {"wifi": wifi_bad, "canteen": canteen_bad, "library": library_bad, "transport": transport_bad},
        "transactions": len(baskets),
        "job1": job1, "job2": job2, "job3": job3, "job4": dict(job4),
        "job5_global": (g_total, g_visits, overall), "job5": job5, "job6": job6,
    }


def _read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _close(text, value):
    return abs(Fraction(text) - value) <= TOL


def compare(data_dir, out_dir):
    """Compare every output row with the reference. Returns {job: [mismatch descriptions]}."""
    e, o = expected(data_dir), Path(out_dir)
    issues = defaultdict(list)

    def check(job, rows, key, exp, ok):
        got = {key(r): r for r in rows}
        for k in sorted(set(got) ^ set(exp), key=str):
            issues[job].append(f"key {k!r} {'missing' if k in exp else 'unexpected'}")
        for k in sorted(set(got) & set(exp), key=str):
            if not ok(got[k], exp[k]):
                issues[job].append(f"key {k!r}: got {got[k]} expected {exp[k]}")
        issues[job]  # ensure job present even when clean

    check("job1", _read(o / "job1_hourly_wifi.csv"), lambda r: r["Hour"], e["job1"],
          lambda r, x: _close(r["TotalDataMB"], x[0]) and _close(r["TotalDurationMin"], x[1]) and int(r["Sessions"]) == x[2])
    check("job2", _read(o / "job2_access_points.csv"), lambda r: r["AccessPoint"], e["job2"],
          lambda r, x: _close(r["TotalDataMB"], x[0]) and _close(r["TotalDurationMin"], x[1])
          and int(r["Sessions"]) == x[2] and _close(r["AvgSessionDurationMin"], x[3]))
    check("job3", _read(o / "job3_canteen_items.csv"), lambda r: r["Item"], e["job3"],
          lambda r, x: int(r["TotalQuantity"]) == x[0] and _close(r["TotalRevenue"], x[1]))
    check("job4", _read(o / "job4_pairs.csv"), lambda r: (r["ItemA"], r["ItemB"]), e["job4"],
          lambda r, x: int(r["TransactionCount"]) == x)
    check("job5", _read(o / "job5_anomalies.csv"), lambda r: r["StudentID"], e["job5"],
          lambda r, x: _close(r["TotalDurationMin"], x[0]) and int(r["Visits"]) == x[1])
    check("job6", _read(o / "job6_route_hour_speed.csv"), lambda r: (r["RouteID"], r["Hour"]), e["job6"],
          lambda r, x: _close(r["AverageSpeedKmph"], x[0]) and int(r["ObservationCount"]) == x[1]
          and (r["CongestionStatus"] == "CONGESTED") == x[2])
    g = _read(o / "job5_overall.csv")[0]
    g_total, g_visits, overall = e["job5_global"]
    if not (_close(g["TotalDurationMin"], g_total) and int(g["Visits"]) == g_visits
            and (g["OverallAverageMin"] == "UNDEFINED" if overall is None else _close(g["OverallAverageMin"], overall))):
        issues["job5"].append(f"global: got {g} expected {e['job5_global']}")
    return dict(issues)
