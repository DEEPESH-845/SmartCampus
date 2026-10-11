#!/usr/bin/env python3
"""Generate SYNTHETIC SmartCampus datasets (no real student data).

Same arguments => byte-identical files. Writes data/{wifi_logs,canteen,library,transport}.csv
and data/README.md describing the run.
"""
import argparse
import csv
import random
from datetime import datetime, timedelta
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from mr_common import HEADERS  # noqa: E402  single source of truth for schemas

START = datetime(2026, 8, 10)
ACCESS_POINTS = [f"AP{i:02d}" for i in range(1, 13)]
ROUTES = [f"R{i:02d}" for i in range(1, 9)]
VEHICLES = [f"BUS{i:02d}" for i in range(1, 21)]
# (item, unit price). Two names contain a comma/quote to exercise CSV quoting.
MENU = [("Tea", 20), ("Coffee", 35), ("Sandwich", 80), ("Samosa", 15), ("Veg Biryani", 120),
        ("Paneer Roll", 70), ("Juice", 50), ("Cookies", 25), ("Chips, Salted", 20),
        ('Masala "Special" Dosa', 90), ("Water Bottle", 10), ("Ice Cream", 40)]
# Malformed rows injected on purpose so rejection accounting is exercised.
MALFORMED = {
    "wifi": ["S999,not-a-time,AP01,10,5", "S998,2026-08-10 09:00,AP01,-5,10",
             "S997,2026-08-10 09:00,AP01,abc,10", "S996,2026-08-10 09:00,AP01", ",2026-08-10 09:00,AP01,1,1"],
    "canteen": ["T0001,2026-08-10 13:00,S101,Tea,1.5,30", "T0002,2026-13-10 13:00,S101,Tea,1,20",
                "T0003,2026-08-10 13:00,S101,,1,20", "T0004,2026-08-10 13:00,S101,Tea,1,-20",
                'T0005,2026-08-10 13:00,S101,"Tea,1,20'],
    "library": ["S101,2026-08-10 10:00,EXIT,30", "S101,2026-08-10 10:00,ENTRY,-1",
                "S101,2026-02-30 10:00,ENTRY,30", "S101,2026-08-10 10:00,ENTRY,nan", "S101,2026-08-10 10:00,ENTRY"],
    "transport": ["BUS01,2026-08-10 08:00,R01,-12", "BUS01,2026-08-10 08:00,,25",
                  "BUS01,2026-08-10 25:00,R01,25", "BUS01,2026-08-10 08:00,R01,fast", "BUS01,2026-08-10 08:00,R01,25,extra"],
}


def ts(day, hour, minute):
    return (START + timedelta(days=day, hours=hour, minutes=minute)).strftime("%Y-%m-%d %H:%M")


def campus_hour(rng):
    # Busier during the teaching day, peaking late morning / early afternoon.
    return rng.choices(range(7, 23), weights=[1, 3, 6, 8, 9, 8, 7, 9, 8, 6, 4, 3, 3, 2, 2, 1])[0]


def wifi(rng, a, students):
    rows = []
    for _ in range(a.wifi_rows):
        day, hour = rng.randrange(a.days), campus_hour(rng)
        duration = rng.randint(1, 120)
        data = round(duration * rng.uniform(0.2, 6.0), 1)
        rows.append([rng.choice(students), ts(day, hour, rng.randrange(60)), rng.choice(ACCESS_POINTS), data, duration])
    return rows


def canteen(rng, a, students):
    rows = []
    for t in range(a.transactions):
        day, hour, minute = rng.randrange(a.days), rng.choice([8, 10, 12, 13, 13, 14, 16, 17]), rng.randrange(60)
        tid, student = f"T{1001 + t}", rng.choice(students)
        basket = rng.sample(MENU, rng.choices([1, 2, 3, 4], weights=[3, 4, 2, 1])[0])
        if rng.random() < 0.3:  # habitual combos make some pairs clearly "top"
            basket = [MENU[0], MENU[3]] if rng.random() < 0.5 else [MENU[1], MENU[2]]
        if rng.random() < 0.05:  # same item on two lines of one transaction
            basket.append(basket[0])
        for item, price in basket:
            qty = rng.choices([1, 2, 3], weights=[6, 3, 1])[0]
            rows.append([tid, ts(day, hour, minute), student, item, qty, qty * price])
    return rows


def library(rng, a, students):
    heavy = set(rng.sample(students, a.heavy_readers))
    rows = []
    for _ in range(a.library_visits):
        s = rng.choice(students)
        if s in heavy:
            duration = rng.randint(150, 300)
        else:
            duration = 0 if rng.random() < 0.01 else max(5, min(180, int(rng.gauss(60, 25))))
        rows.append([s, ts(rng.randrange(a.days), rng.randint(8, 20), rng.randrange(60)), "ENTRY", duration])
    return rows


def transport(rng, a):
    rows = []
    base = {r: rng.uniform(19, 34) for r in ROUTES}
    for day in range(a.days):
        for hour in range(7, 21):
            rush = 7 if hour in (8, 9, 17, 18) else 0
            for route in ROUTES:
                for _ in range(rng.randint(3, 6)):
                    speed = max(3.0, round(rng.gauss(base[route] - rush, 4), 1))
                    rows.append([rng.choice(VEHICLES), ts(day, hour, rng.randrange(60)), route, speed])
    return rows


def write(path, header, rows, bad, rng):
    for line in bad:  # insert at seeded positions
        rows.insert(rng.randrange(len(rows) + 1), line)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        for r in rows:
            f.write(r + "\n") if isinstance(r, str) else w.writerow(r)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out-dir", type=Path, default=ROOT / "data")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--students", type=int, default=200)
    p.add_argument("--wifi-rows", type=int, default=5000)
    p.add_argument("--transactions", type=int, default=1500)
    p.add_argument("--library-visits", type=int, default=1500)
    p.add_argument("--heavy-readers", type=int, default=5, help="students given long library visits")
    p.add_argument("--malformed", type=int, default=5, help="malformed rows per dataset (0-5)")
    a = p.parse_args(argv)
    if a.days < 1 or a.students < max(1, a.heavy_readers) or not 0 <= a.malformed <= 5:
        p.error("need days >= 1, students >= max(1, heavy-readers), 0 <= malformed <= 5")

    rng = random.Random(a.seed)
    students = [f"S{101 + i}" for i in range(a.students)]
    a.out_dir.mkdir(parents=True, exist_ok=True)
    data = {"wifi": wifi(rng, a, students), "canteen": canteen(rng, a, students),
            "library": library(rng, a, students), "transport": transport(rng, a)}
    files = {"wifi": "wifi_logs.csv", "canteen": "canteen.csv", "library": "library.csv", "transport": "transport.csv"}
    for name, rows in data.items():
        rows.sort(key=lambda r: r[1])  # time-ordered like a log; transactions are NOT made contiguous
        write(a.out_dir / files[name], HEADERS[name], rows, MALFORMED[name][:a.malformed], rng)
        print(f"{files[name]}: {len(rows)} data rows (incl. {a.malformed} malformed)")
    (a.out_dir / "README.md").write_text(
        "# SYNTHETIC DATA\n\nAll files in this directory are synthetic, generated by "
        "`scripts/generate_data.py`. They contain no real student information.\n\n"
        f"Arguments: `{' '.join(f'--{k.replace(chr(95), chr(45))} {v}' for k, v in sorted(vars(a).items()) if k != 'out_dir')}`\n\n"
        f"Each file includes {a.malformed} deliberately malformed rows to exercise rejection accounting.\n",
        encoding="utf-8")


if __name__ == "__main__":
    main()
