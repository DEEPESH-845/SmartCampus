#!/usr/bin/env python3
"""Job 5 filter reducer -> CSV StudentID,TotalDurationMin,Visits,AverageDurationMin,OverallAverageMin,ThresholdMin."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import csv_writer, decimals, fmt, groups

out = csv_writer()
for student, values in groups():
    values = list(values)
    if len(values) != 1:
        sys.exit(f"student {student!r} appears {len(values)} times; expected 1")
    total, visits, g_total, g_visits = decimals(values[0], 4)
    overall = g_total / g_visits
    out.writerow([student, fmt(total), visits, fmt(total / visits), fmt(overall), fmt(overall * 3 / 2)])
