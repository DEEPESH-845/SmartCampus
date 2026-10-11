#!/usr/bin/env python3
"""Job 5 global mapper: stage-1 output -> "GLOBAL<TAB>TotalDuration,Visits".

Summing per-student totals equals summing every visit, so the average is visit-weighted."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import decimals, groups, utf8_stdout

utf8_stdout()
for _student, values in groups():
    for v in values:
        total, visits = decimals(v, 2)
        print(f"GLOBAL\t{total},{visits}")
