#!/usr/bin/env python3
"""Job 5 stage 1 reducer: per-student totals -> "StudentID<TAB>TotalDuration,Visits"."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import groups, sum_values, utf8_stdout

utf8_stdout()
for student, values in groups():
    total, visits = sum_values(values, 2)
    print(f"{student}\t{total},{visits}")
