#!/usr/bin/env python3
"""Job 5 filter mapper: stage-1 output -> anomalous students only.

The global result reaches this stage as a side file, not shared memory: path from env
GLOBAL_STATS (default ./global_stats.txt, i.e. the Hadoop distributed-cache symlink
created by `-files <global part file>#global_stats.txt`).

Anomaly: total/visits > 1.5 * g_total/g_visits, evaluated exactly as
2 * total * g_visits > 3 * g_total * visits (strict; no rounding at the boundary)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import decimals, groups, utf8_stdout

path = os.environ.get("GLOBAL_STATS", "global_stats.txt")
with open(path, encoding="utf-8") as f:
    lines = [ln for ln in f.read().splitlines() if ln.strip()]
if len(lines) != 1 or not lines[0].startswith("GLOBAL\t"):
    sys.exit(f"expected exactly one GLOBAL line in {path}")
g_total, g_visits = decimals(lines[0].split("\t")[1].rsplit(",", 1)[0], 2)

utf8_stdout()
for student, values in groups():
    for v in values:
        total, visits = decimals(v, 2)
        if g_visits and 2 * total * g_visits > 3 * g_total * visits:
            print(f"{student}\t{total},{visits},{g_total},{g_visits}")
